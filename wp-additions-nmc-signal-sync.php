<?php
/**
 * NMC SIGNAL//OS — Additional REST endpoints
 * Paste this block at the BOTTOM of:
 *   Appearance → Theme File Editor → nmc-signal-sync.php
 *
 * Adds: artists, artist-push, catalogue, submissions, shop-stats
 */

// ── Register new routes (add inside the existing init hook) ─────────────────
add_action( 'rest_api_init', function () {

    // GET  /wp-json/nmcsignal/v1/artists       — all nmc_artist posts
    register_rest_route( 'nmcsignal/v1', '/artists', [
        'methods'             => 'GET',
        'callback'            => 'nmcsignal_get_artists',
        'permission_callback' => 'nmcsignal_is_authorised',
    ] );

    // POST /wp-json/nmcsignal/v1/artist-push   — create or update nmc_artist post
    register_rest_route( 'nmcsignal/v1', '/artist-push', [
        'methods'             => 'POST',
        'callback'            => 'nmcsignal_push_artist',
        'permission_callback' => 'nmcsignal_is_authorised',
    ] );

    // GET  /wp-json/nmcsignal/v1/catalogue     — all nmc_track posts with ACF
    register_rest_route( 'nmcsignal/v1', '/catalogue', [
        'methods'             => 'GET',
        'callback'            => 'nmcsignal_get_catalogue',
        'permission_callback' => 'nmcsignal_is_authorised',
    ] );

    // GET  /wp-json/nmcsignal/v1/submissions   — latest music submissions
    register_rest_route( 'nmcsignal/v1', '/submissions', [
        'methods'             => 'GET',
        'callback'            => 'nmcsignal_get_submissions',
        'permission_callback' => 'nmcsignal_is_authorised',
    ] );

    // GET  /wp-json/nmcsignal/v1/shop-stats    — WooCommerce product + order counts
    register_rest_route( 'nmcsignal/v1', '/shop-stats', [
        'methods'             => 'GET',
        'callback'            => 'nmcsignal_get_shop_stats',
        'permission_callback' => 'nmcsignal_is_authorised',
    ] );

} );

// ── Handlers ────────────────────────────────────────────────────────────────

/**
 * GET /artists — All nmc_artist posts with meta
 */
function nmcsignal_get_artists() {
    $posts = get_posts( [
        'post_type'   => 'nmc_artist',
        'post_status' => 'publish',
        'numberposts' => -1,
        'orderby'     => 'title',
        'order'       => 'ASC',
    ] );

    $artists = [];
    foreach ( $posts as $post ) {
        $artists[] = [
            'id'          => $post->ID,
            'slug'        => $post->post_name,
            'name'        => $post->post_title,
            'bio'         => wp_strip_all_tags( $post->post_content ),
            'genre'       => get_post_meta( $post->ID, 'nmc_genre', true ),
            'origin'      => get_post_meta( $post->ID, 'nmc_origin', true ),
            'bpm'         => get_post_meta( $post->ID, 'nmc_bpm', true ),
            'instruments' => get_post_meta( $post->ID, 'nmc_instruments', true ),
            'signature'   => get_post_meta( $post->ID, 'nmc_signature', true ),
            'thumbnail'   => get_the_post_thumbnail_url( $post->ID, 'medium' ) ?: '',
            'url'         => get_permalink( $post->ID ),
        ];
    }

    return rest_ensure_response( [ 'artists' => $artists, 'count' => count( $artists ) ] );
}

/**
 * POST /artist-push — Create or update an nmc_artist post from SIGNAL//OS
 * Body: { name, bio, genre, origin, instruments, signature, music_prompt, instrumental_prompt, literary_prompt }
 */
function nmcsignal_push_artist( WP_REST_Request $req ) {
    $p = $req->get_json_params();
    $name = sanitize_text_field( $p['name'] ?? '' );
    if ( ! $name ) {
        return new WP_Error( 'missing_name', 'Artist name required', [ 'status' => 400 ] );
    }

    // Check if an nmc_artist with this title already exists
    $existing = get_posts( [
        'post_type'   => 'nmc_artist',
        'title'       => $name,
        'numberposts' => 1,
        'post_status' => 'any',
    ] );

    $post_data = [
        'post_type'    => 'nmc_artist',
        'post_title'   => $name,
        'post_status'  => 'publish',
        'post_content' => sanitize_textarea_field( $p['bio'] ?? '' ),
    ];

    if ( $existing ) {
        $post_data['ID'] = $existing[0]->ID;
        $post_id = wp_update_post( $post_data, true );
        $action  = 'updated';
    } else {
        $post_id = wp_insert_post( $post_data, true );
        $action  = 'created';
    }

    if ( is_wp_error( $post_id ) ) {
        return new WP_Error( 'wp_error', $post_id->get_error_message(), [ 'status' => 500 ] );
    }

    // Meta fields
    $meta_map = [
        'nmc_genre'              => 'genre',
        'nmc_origin'             => 'origin',
        'nmc_instruments'        => 'instruments',
        'nmc_signature'          => 'signature',
        'nmc_music_prompt'       => 'music_prompt',
        'nmc_instrumental_prompt'=> 'instrumental_prompt',
        'nmc_literary_prompt'    => 'literary_prompt',
    ];
    foreach ( $meta_map as $meta_key => $param_key ) {
        if ( isset( $p[ $param_key ] ) ) {
            update_post_meta( $post_id, $meta_key, sanitize_textarea_field( $p[ $param_key ] ) );
        }
    }

    return rest_ensure_response( [
        'success' => true,
        'post_id' => $post_id,
        'action'  => $action,
        'name'    => $name,
        'url'     => get_permalink( $post_id ),
    ] );
}

/**
 * GET /catalogue — All nmc_track posts (published + drafts) with stats
 */
function nmcsignal_get_catalogue() {
    $posts = get_posts( [
        'post_type'   => 'nmc_track',
        'post_status' => [ 'publish', 'draft' ],
        'numberposts' => -1,
        'orderby'     => 'date',
        'order'       => 'DESC',
    ] );

    $tracks = [];
    foreach ( $posts as $post ) {
        // Try ACF field keys first, fall back to post meta keys
        $artist  = function_exists( 'get_field' )
            ? ( get_field( 'field_nmc_track_artist_name', $post->ID ) ?: get_post_meta( $post->ID, '_nmc_artist_name', true ) )
            : get_post_meta( $post->ID, '_nmc_artist_name', true );

        $streams = function_exists( 'get_field' )
            ? (int) get_field( 'field_nmc_track_streams', $post->ID )
            : (int) get_post_meta( $post->ID, '_nmc_track_streams', true );

        $tracks[] = [
            'id'       => $post->ID,
            'title'    => $post->post_title,
            'status'   => $post->post_status,
            'artist'   => $artist ?: '',
            'audio_url'=> function_exists( 'get_field' ) ? get_field( 'field_nmc_track_audio_url', $post->ID ) : '',
            'bpm'      => function_exists( 'get_field' ) ? get_field( 'field_nmc_track_bpm', $post->ID ) : '',
            'genre'    => function_exists( 'get_field' ) ? get_field( 'field_nmc_track_genre', $post->ID ) : '',
            'streams'  => $streams,
            'featured' => (bool) ( function_exists( 'get_field' ) ? get_field( 'field_nmc_track_featured', $post->ID ) : false ),
            'explicit' => function_exists( 'get_field' ) ? get_field( 'field_nmc_track_explicit', $post->ID ) : '',
            'date'     => $post->post_date,
            'edit_url' => admin_url( 'post.php?post=' . $post->ID . '&action=edit' ),
        ];
    }

    $published     = array_filter( $tracks, fn( $t ) => $t['status'] === 'publish' );
    $total_streams = array_sum( array_column( array_values( $published ), 'streams' ) );

    return rest_ensure_response( [
        'tracks'        => $tracks,
        'total'         => count( $tracks ),
        'published'     => count( $published ),
        'drafts'        => count( $tracks ) - count( $published ),
        'total_streams' => $total_streams,
    ] );
}

/**
 * GET /submissions — Latest music submissions (Flamingo or custom table)
 */
function nmcsignal_get_submissions() {
    $submissions = [];

    // Try Flamingo (Contact Form 7 CRM plugin) first
    if ( post_type_exists( 'flamingo_inbound' ) ) {
        $posts = get_posts( [
            'post_type'   => 'flamingo_inbound',
            'post_status' => 'publish',
            'numberposts' => 25,
            'orderby'     => 'date',
            'order'       => 'DESC',
        ] );
        foreach ( $posts as $post ) {
            $fields = get_post_meta( $post->ID, '_fields', true ) ?: [];
            $submissions[] = [
                'id'      => $post->ID,
                'date'    => $post->post_date,
                'subject' => $post->post_title,
                'from'    => get_post_meta( $post->ID, '_from', true ) ?: '',
                'channel' => get_post_meta( $post->ID, '_channel', true ) ?: 'contact-form',
                'fields'  => is_array( $fields ) ? $fields : [],
            ];
        }
    } else {
        // Fallback: check for a custom submissions table
        global $wpdb;
        $table = $wpdb->prefix . 'nmc_submissions';
        if ( $wpdb->get_var( "SHOW TABLES LIKE '{$table}'" ) === $table ) {
            $rows = $wpdb->get_results(
                "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT 25",
                ARRAY_A
            );
            foreach ( $rows as $row ) {
                $submissions[] = [
                    'id'      => $row['id'],
                    'date'    => $row['created_at'] ?? '',
                    'subject' => $row['subject'] ?? 'Music Submission',
                    'from'    => $row['email'] ?? '',
                    'channel' => 'submit-music',
                    'fields'  => json_decode( $row['data'] ?? '{}', true ) ?: [],
                ];
            }
        }
    }

    return rest_ensure_response( [ 'submissions' => $submissions, 'count' => count( $submissions ) ] );
}

// ── ADMIN SIDEBAR CLEANUP ─────────────────────────────────────────────────
// Removes empty / duplicate CPT menu items. WP silently ignores slugs that
// don't exist, so all likely variations for Cipher Entries are listed safely.
add_action( 'admin_menu', function () {
    remove_menu_page( 'edit.php?post_type=nmc_album' );         // Albums & EPs — empty, Releases is canonical
    remove_menu_page( 'edit.php?post_type=nmc_cipher' );        // Cipher Entries (likely slug)
    remove_menu_page( 'edit.php?post_type=nmc_cipher_entry' );  // Cipher Entries (alt slug)
    remove_menu_page( 'edit.php?post_type=cipher_entry' );      // Cipher Entries (alt slug)
    remove_menu_page( 'edit.php?post_type=nmc_lyric' );         // Cipher Entries (alt slug)
    remove_menu_page( 'edit.php?post_type=nmc_lyric_entry' );   // Cipher Entries (alt slug)
}, 999 );

/**
 * GET /shop-stats — WooCommerce product and order counts
 */
function nmcsignal_get_shop_stats() {
    if ( ! function_exists( 'wc_get_orders' ) ) {
        return rest_ensure_response( [ 'woocommerce' => false, 'message' => 'WooCommerce not active' ] );
    }

    $products = get_posts( [
        'post_type'   => 'product',
        'post_status' => 'publish',
        'numberposts' => -1,
        'fields'      => 'ids',
    ] );

    $orders          = wc_get_orders( [ 'status' => [ 'completed', 'processing' ], 'limit' => 50 ] );
    $recent_revenue  = 0.0;
    foreach ( $orders as $order ) {
        $recent_revenue += (float) $order->get_total();
    }

    return rest_ensure_response( [
        'woocommerce'    => true,
        'products'       => count( $products ),
        'recent_orders'  => count( $orders ),
        'recent_revenue' => number_format( $recent_revenue, 2 ),
        'currency'       => get_woocommerce_currency(),
        'shop_url'       => wc_get_page_permalink( 'shop' ),
    ] );
}
