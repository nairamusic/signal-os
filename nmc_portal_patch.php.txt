
// ══════════════════════════════════════════════════════════════════════════════
// NMC USER PORTAL — typed accounts, submit-track, my-submissions, profile
// Data layer: Flamingo inbound (shared with Signal//OS A&R panel)
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. REGISTRATION: user-type picker ────────────────────────────────────────
add_action('woocommerce_register_form', function(){
    $types = [
        'listener' => 'Listener / Fan',
        'artist'   => 'Independent Artist',
        'label'    => 'Record Label / Manager',
        'buyer'    => 'Music Buyer / Collector',
        'other'    => 'Other',
    ];
    echo '<div class="nmc-reg-type"><p class="nmc-reg-label">What best describes you?</p>';
    foreach ($types as $v => $l) {
        echo '<label class="nmc-reg-option"><input type="radio" name="nmc_user_type" value="' . esc_attr($v) . '" required> ' . esc_html($l) . '</label>';
    }
    echo '</div>';
    echo '<style>
.nmc-reg-type{margin:16px 0 20px}
.nmc-reg-label{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin:0 0 10px}
.nmc-reg-option{display:flex;align-items:center;gap:10px;padding:9px 14px;margin-bottom:6px;border:1px solid rgba(255,255,255,.12);border-radius:6px;cursor:pointer;font-size:.9rem;transition:border-color .15s}
.nmc-reg-option:hover{border-color:#c9a84c}
.nmc-reg-option input{accent-color:#c9a84c}
</style>';
});

add_action('woocommerce_created_customer', function($uid) {
    $allowed = ['listener','artist','label','buyer','other'];
    $t = sanitize_text_field($_POST['nmc_user_type'] ?? 'listener');
    update_user_meta($uid, 'nmc_user_type', in_array($t, $allowed) ? $t : 'listener');
});

// ── 2. WC ENDPOINTS ──────────────────────────────────────────────────────────
add_action('init', function(){
    add_rewrite_endpoint('submit-track',  EP_ROOT | EP_PAGES);
    add_rewrite_endpoint('my-submissions', EP_ROOT | EP_PAGES);
    add_rewrite_endpoint('my-profile',    EP_ROOT | EP_PAGES);
    if (!get_transient('nmc_portal_flushed')) {
        flush_rewrite_rules();
        set_transient('nmc_portal_flushed', 1, WEEK_IN_SECONDS);
    }
}, 21);

// ── 3. ACCOUNT MENU ──────────────────────────────────────────────────────────
add_filter('woocommerce_account_menu_items', function($items) {
    $type = get_user_meta(get_current_user_id(), 'nmc_user_type', true) ?: 'listener';
    $out  = [];
    foreach ($items as $k => $l) {
        $out[$k] = $l;
        if ($k === 'dashboard') $out['my-profile'] = 'My Profile';
    }
    if (in_array($type, ['artist','label'])) {
        $out['submit-track']   = '+ Submit Track';
        $out['my-submissions'] = 'My Submissions';
    }
    return $out;
});

// ── 4. DASHBOARD HOME ────────────────────────────────────────────────────────
add_action('woocommerce_account_dashboard', function(){
    $user = wp_get_current_user();
    $type = get_user_meta($user->ID, 'nmc_user_type', true) ?: 'listener';
    $name = esc_html($user->display_name ?: $user->user_login);

    $subs_pending = 0;
    if (in_array($type, ['artist','label']) && post_type_exists('flamingo_inbound')) {
        $ids = get_posts(['post_type' => 'flamingo_inbound', 'post_status' => 'publish',
            'numberposts' => -1, 'fields' => 'ids',
            'meta_query' => [['key' => '_nmc_submitter_id', 'value' => $user->ID]]]);
        foreach ($ids as $pid) {
            if ((get_post_meta($pid, '_nmc_status', true) ?: 'pending') === 'pending') $subs_pending++;
        }
    }

    $info = [
        'listener' => ['Listener',        'Your downloads, orders and account settings.'],
        'artist'   => ['Independent Artist','Submit tracks, track A&amp;R decisions, manage your profile.'],
        'label'    => ['Record Label',     'Submit roster tracks, monitor A&amp;R status, manage your label profile.'],
        'buyer'    => ['Music Buyer',      'Your orders, downloads and account settings.'],
        'other'    => ['Member',           'Your orders, downloads and account settings.'],
    ];
    $badge = $info[$type][0] ?? 'Member';
    $sub   = $info[$type][1] ?? 'Manage your account.';

    echo '<div class="nmc-dw">';
    echo '<div class="nmc-dw-head">';
    echo '<span class="nmc-badge" style="background:#c9a84c;color:#000">' . esc_html($badge) . '</span>';
    if ($subs_pending) echo '<span class="nmc-badge" style="background:#ef4444;color:#fff">' . $subs_pending . ' pending A&amp;R</span>';
    echo '</div>';
    echo '<h2 class="nmc-dw-title">Welcome back, <strong>' . $name . '</strong></h2>';
    echo '<p class="nmc-dw-sub">' . $sub . '</p>';
    echo '</div>';

    $cards = [
        ['📦', 'Orders',    wc_get_account_endpoint_url('orders')],
        ['⬇',  'Downloads', wc_get_account_endpoint_url('downloads')],
        ['👤', 'My Profile',wc_get_account_endpoint_url('my-profile')],
        ['🔑', 'Account',   wc_get_account_endpoint_url('edit-account')],
    ];
    if (in_array($type, ['artist','label'])) {
        array_splice($cards, 2, 0, [
            ['🎵', 'Submit Track',   wc_get_account_endpoint_url('submit-track')],
            ['📋', 'My Submissions', wc_get_account_endpoint_url('my-submissions')],
        ]);
    }
    echo '<div class="nmc-cards">';
    foreach ($cards as [$ic, $lb, $hr]) {
        echo '<a href="' . esc_url($hr) . '" class="nmc-card"><span class="nmc-card-ic">' . $ic . '</span><span>' . esc_html($lb) . '</span></a>';
    }
    echo '</div>';
});

// ── 5. MY PROFILE ENDPOINT ───────────────────────────────────────────────────
add_action('woocommerce_account_my-profile_endpoint', function(){
    $user = wp_get_current_user();
    $type = get_user_meta($user->ID, 'nmc_user_type', true) ?: 'listener';

    if (isset($_POST['nmc_profile_save']) && wp_verify_nonce($_POST['_nmc_nonce'] ?? '', 'nmc_profile')) {
        $allowed = ['listener','artist','label','buyer','other'];
        $nt = sanitize_text_field($_POST['nmc_user_type'] ?? $type);
        if (in_array($nt, $allowed)) { update_user_meta($user->ID, 'nmc_user_type', $nt); $type = $nt; }
        update_user_meta($user->ID, 'nmc_bio',       sanitize_textarea_field($_POST['nmc_bio']      ?? ''));
        update_user_meta($user->ID, 'nmc_location',  sanitize_text_field($_POST['nmc_location']     ?? ''));
        update_user_meta($user->ID, 'nmc_website',   esc_url_raw($_POST['nmc_website']              ?? ''));
        update_user_meta($user->ID, 'nmc_instagram', sanitize_text_field($_POST['nmc_instagram']    ?? ''));
        update_user_meta($user->ID, 'nmc_soundcloud',esc_url_raw($_POST['nmc_soundcloud']           ?? ''));
        echo '<div class="woocommerce-message">Profile updated.</div>';
    }

    $bio = get_user_meta($user->ID, 'nmc_bio',       true);
    $loc = get_user_meta($user->ID, 'nmc_location',  true);
    $web = get_user_meta($user->ID, 'nmc_website',   true);
    $ig  = get_user_meta($user->ID, 'nmc_instagram', true);
    $sc  = get_user_meta($user->ID, 'nmc_soundcloud',true);

    $types = ['listener'=>'Listener / Fan','artist'=>'Independent Artist','label'=>'Record Label / Manager','buyer'=>'Music Buyer / Collector','other'=>'Other'];
    $fi = 'width:100%;margin-top:5px;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.15);color:inherit;border-radius:5px;box-sizing:border-box;font-family:inherit;font-size:.9rem';

    echo '<h2>My Profile</h2>';
    echo '<p style="font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;opacity:.5;margin-bottom:14px">Account type</p>';
    echo '<form method="post" class="nmc-pf">';
    echo wp_nonce_field('nmc_profile', '_nmc_nonce', true, false);
    echo '<div class="nmc-type-chips">';
    foreach ($types as $v => $l) {
        $on = $type === $v ? ' nmc-chip-on' : '';
        echo '<label class="nmc-chip' . $on . '"><input type="radio" name="nmc_user_type" value="' . esc_attr($v) . '" ' . checked($type, $v, false) . '> ' . esc_html($l) . '</label>';
    }
    echo '</div>';
    echo '<label style="display:block;margin-bottom:14px;font-size:.85rem">Bio / About<textarea name="nmc_bio" rows="3" style="' . $fi . '">' . esc_textarea($bio) . '</textarea></label>';
    echo '<div class="nmc-fg2">';
    echo '<label style="display:block">Location<input type="text" name="nmc_location" value="' . esc_attr($loc) . '" placeholder="City, Country" style="' . $fi . '"></label>';
    echo '<label style="display:block">Website<input type="url" name="nmc_website" value="' . esc_attr($web) . '" placeholder="https://" style="' . $fi . '"></label>';
    echo '<label style="display:block">Instagram handle<input type="text" name="nmc_instagram" value="' . esc_attr($ig) . '" placeholder="@handle" style="' . $fi . '"></label>';
    echo '<label style="display:block">SoundCloud / Streaming link<input type="url" name="nmc_soundcloud" value="' . esc_attr($sc) . '" placeholder="https://soundcloud.com/" style="' . $fi . '"></label>';
    echo '</div>';
    echo '<button type="submit" name="nmc_profile_save" value="1" class="nmc-btn">Save Profile</button>';
    echo '</form>';
});

// ── 6. SUBMIT TRACK ENDPOINT ─────────────────────────────────────────────────
add_action('woocommerce_account_submit-track_endpoint', function(){
    $user = wp_get_current_user();
    $type = get_user_meta($user->ID, 'nmc_user_type', true) ?: 'listener';

    if (!in_array($type, ['artist','label'])) {
        echo '<div class="woocommerce-info">Track submission is for artists and record labels. <a href="' . esc_url(wc_get_account_endpoint_url('my-profile')) . '">Change your account type</a> to unlock this.</div>';
        return;
    }

    $genres = ['Afrobeats','Afropop','Afrodrill','Highlife','Gospel','Hip-Hop','R&B','Dancehall','Reggae','Amapiano','Grime','Electronic','Other'];
    $fi = 'width:100%;margin-top:5px;padding:10px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.15);color:inherit;border-radius:5px;box-sizing:border-box;font-family:inherit;font-size:.9rem';
    $subs_url = esc_url(wc_get_account_endpoint_url('my-submissions'));

    echo '<h2>Submit a Track</h2>';
    echo '<p style="opacity:.55;margin-bottom:24px;font-size:.9rem">Submit for NMC A&amp;R review. Decisions appear in <a href="' . $subs_url . '" style="color:#c9a84c">My Submissions</a> within 14 days. All genres welcome.</p>';
    echo '<div id="nmc-st-msg"></div>';
    echo '<form id="nmc-st" enctype="multipart/form-data">';
    echo wp_nonce_field('nmc_submit_track', '_nmc_st_nonce', true, false);
    echo '<div class="nmc-fg2">';
    echo '<label style="display:block">Track Title *<input type="text" name="track_title" required placeholder="e.g. Lagos Nights" style="' . $fi . '"></label>';
    echo '<label style="display:block">Artist / Label Name *<input type="text" name="artist_name" required value="' . esc_attr($user->display_name) . '" style="' . $fi . '"></label>';
    echo '</div><div class="nmc-fg2">';
    echo '<label style="display:block">Genre *<select name="genre" required style="' . $fi . ';background:#0d0d0d"><option value="">Select genre&hellip;</option>';
    foreach ($genres as $g) echo '<option>' . esc_html($g) . '</option>';
    echo '</select></label>';
    echo '<label style="display:block">BPM <span style="opacity:.4">(optional)</span><input type="number" name="bpm" min="40" max="240" placeholder="e.g. 96" style="' . $fi . '"></label>';
    echo '</div>';
    echo '<label style="display:block;margin-bottom:14px">Streaming / SoundCloud link <span style="opacity:.4">(or upload below)</span><input type="url" name="stream_link" placeholder="https://soundcloud.com/" style="' . $fi . '"></label>';
    echo '<div class="nmc-upload-zone">';
    echo '<p style="font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;opacity:.5;margin:0 0 10px">Upload Track File <span class="nmc-upload-tag">MP3 or WAV &middot; max 50MB</span></p>';
    echo '<input type="file" name="track_file" accept=".mp3,.wav,audio/mpeg,audio/wav" style="color:inherit" id="nmc-file-pick">';
    echo '<span id="nmc-fn" style="font-size:.8rem;opacity:.5;margin-top:6px;display:block"></span>';
    echo '</div>';
    echo '<label style="display:block;margin-bottom:20px">Notes for A&amp;R <span style="opacity:.4">(optional)</span><textarea name="notes" rows="3" placeholder="Inspiration, featured artists, release plans&hellip;" style="' . $fi . '"></textarea></label>';
    echo '<div style="display:flex;align-items:center;gap:16px">';
    echo '<button type="submit" class="nmc-btn" id="nmc-st-btn">Submit for A&amp;R Review</button>';
    echo '<span id="nmc-st-prog" style="font-size:.85rem;opacity:.5"></span>';
    echo '</div></form>';

    // Inline JS — no PHP tags needed, pure echo
    $ajax_url = admin_url('admin-ajax.php');
    echo '<script>
(function(){
var form=document.getElementById("nmc-st");
var btn=document.getElementById("nmc-st-btn");
var prog=document.getElementById("nmc-st-prog");
var msg=document.getElementById("nmc-st-msg");
var fp=document.getElementById("nmc-file-pick");
var fn=document.getElementById("nmc-fn");
if(fp)fp.addEventListener("change",function(){fn.textContent=this.files[0]?this.files[0].name:"";});
if(!form)return;
form.addEventListener("submit",function(e){
    e.preventDefault();
    btn.disabled=true;prog.textContent="Uploading…";msg.innerHTML="";
    var fd=new FormData(this);fd.append("action","nmc_user_submit_track");
    var xhr=new XMLHttpRequest();
    xhr.upload.onprogress=function(ev){if(ev.lengthComputable)prog.textContent="Uploading "+Math.round(ev.loaded/ev.total*100)+"%…";};
    xhr.onload=function(){
        var d;try{d=JSON.parse(xhr.responseText);}catch(er){msg.innerHTML="<div class=\"woocommerce-error\">Unexpected error — please try again.<\/div>";btn.disabled=false;prog.textContent="";return;}
        if(d.success){
            msg.innerHTML="<div class=\"woocommerce-message\">✓ Track submitted! A&R decision within 14 days — check <a href=\""+d.data.subs_url+"\">My Submissions<\/a>.<\/div>";
            form.reset();fn.textContent="";
        }else{
            msg.innerHTML="<div class=\"woocommerce-error\">"+(d.data&&d.data.message?d.data.message:"Submission failed — please try again.")+"<\/div>";
        }
        btn.disabled=false;prog.textContent="";
    }.bind(this);
    xhr.onerror=function(){msg.innerHTML="<div class=\"woocommerce-error\">Network error — please try again.<\/div>";btn.disabled=false;prog.textContent="";};
    xhr.open("POST","' . $ajax_url . '");xhr.send(fd);
});
})();
</script>';
});

// ── 7. AJAX: submit track ─────────────────────────────────────────────────────
add_action('wp_ajax_nmc_user_submit_track', function(){
    if (!check_ajax_referer('nmc_submit_track', '_nmc_st_nonce', false)) {
        wp_send_json_error(['message' => 'Security check failed.']);
    }
    $user = wp_get_current_user();
    $type = get_user_meta($user->ID, 'nmc_user_type', true) ?: 'listener';
    if (!in_array($type, ['artist','label'])) {
        wp_send_json_error(['message' => 'Update your account type to Artist or Record Label to submit tracks.']);
    }
    $title  = sanitize_text_field($_POST['track_title']  ?? '');
    $artist = sanitize_text_field($_POST['artist_name']  ?? '');
    $genre  = sanitize_text_field($_POST['genre']        ?? '');
    $bpm    = absint($_POST['bpm'] ?? 0);
    $link   = esc_url_raw($_POST['stream_link']          ?? '');
    $notes  = sanitize_textarea_field($_POST['notes']    ?? '');

    if (!$title || !$artist || !$genre) {
        wp_send_json_error(['message' => 'Please fill in Track Title, Artist Name and Genre.']);
    }

    // Optional file upload
    $file_url = '';
    if (!empty($_FILES['track_file']['name']) && ($_FILES['track_file']['error'] ?? 4) === 0) {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';
        $up = wp_handle_upload($_FILES['track_file'], [
            'test_form' => false,
            'mimes'     => ['mp3' => 'audio/mpeg', 'wav' => 'audio/wav'],
        ]);
        if (!isset($up['error']) && isset($up['url'])) {
            $att = wp_insert_attachment([
                'post_title'     => sanitize_file_name($_FILES['track_file']['name']),
                'post_mime_type' => $up['type'],
                'post_status'    => 'private',
                'post_author'    => $user->ID,
            ], $up['file']);
            if (!is_wp_error($att)) {
                $file_url = $up['url'];
                update_post_meta($att, 'nmc_submission_user', $user->ID);
            }
        }
    }

    // Store as Flamingo inbound — same table Signal//OS A&R reads
    $post_id = 0;
    if (post_type_exists('flamingo_inbound')) {
        $post_id = wp_insert_post([
            'post_title'  => $artist . ' - ' . $title,
            'post_type'   => 'flamingo_inbound',
            'post_status' => 'publish',
            'post_date'   => current_time('mysql'),
        ]);
        if ($post_id && !is_wp_error($post_id)) {
            update_post_meta($post_id, '_from',             $user->user_email);
            update_post_meta($post_id, '_channel',          'dashboard-submit');
            update_post_meta($post_id, '_nmc_status',       'pending');
            update_post_meta($post_id, '_nmc_submitter_id', $user->ID);
            update_post_meta($post_id, '_fields', [
                'your-name'    => $artist,
                'your-email'   => $user->user_email,
                'track-title'  => $title,
                'genre'        => $genre,
                'bpm'          => $bpm ? (string)$bpm : '',
                'track-link'   => $link ?: $file_url,
                'file-url'     => $file_url,
                'message'      => $notes,
                'account-type' => ucfirst($type),
            ]);
        }
    }

    wp_send_json_success([
        'id'       => $post_id,
        'subs_url' => wc_get_account_endpoint_url('my-submissions'),
    ]);
});

// ── 8. MY SUBMISSIONS ENDPOINT ───────────────────────────────────────────────
add_action('woocommerce_account_my-submissions_endpoint', function(){
    $user = wp_get_current_user();
    $type = get_user_meta($user->ID, 'nmc_user_type', true) ?: 'listener';

    if (!in_array($type, ['artist','label'])) {
        echo '<div class="woocommerce-info">My Submissions is for artists and labels. <a href="' . esc_url(wc_get_account_endpoint_url('my-profile')) . '">Change your account type</a>.</div>';
        return;
    }

    echo '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">';
    echo '<h2 style="margin:0">My Submissions</h2>';
    echo '<a href="' . esc_url(wc_get_account_endpoint_url('submit-track')) . '" class="nmc-btn" style="font-size:.8rem;padding:8px 18px">+ Submit Track</a>';
    echo '</div>';

    $posts = post_type_exists('flamingo_inbound') ? get_posts([
        'post_type'   => 'flamingo_inbound',
        'post_status' => 'publish',
        'numberposts' => 50,
        'orderby'     => 'date',
        'order'       => 'DESC',
        'meta_query'  => [['key' => '_nmc_submitter_id', 'value' => $user->ID, 'compare' => '=']],
    ]) : [];

    if (!$posts) {
        echo '<div class="woocommerce-info" style="text-align:center;padding:48px 24px">';
        echo '<strong>No submissions yet.</strong><br>';
        echo '<a href="' . esc_url(wc_get_account_endpoint_url('submit-track')) . '" style="color:#c9a84c;display:inline-block;margin-top:10px">Submit your first track &rarr;</a>';
        echo '</div>';
        return;
    }

    echo '<div class="nmc-subs-list">';
    foreach ($posts as $p) {
        $f      = get_post_meta($p->ID, '_fields',            true) ?: [];
        $status = get_post_meta($p->ID, '_nmc_status',        true) ?: 'pending';
        $rn     = get_post_meta($p->ID, '_nmc_review_notes',  true) ?: '';
        $rd     = get_post_meta($p->ID, '_nmc_review_date',   true) ?: '';
        $sc     = $status === 'approved' ? '#22c55e' : ($status === 'rejected' ? '#ef4444' : '#c9a84c');
        $tf     = esc_html($f['track-title'] ?? $p->post_title);
        $genre  = esc_html($f['genre'] ?? '');
        $link   = $f['track-link'] ?? $f['file-url'] ?? '';
        $date   = date('j M Y', strtotime($p->post_date));

        echo '<div class="nmc-sub-card">';
        echo '<div class="nmc-sub-head">';
        echo '<div><p class="nmc-eyebrow-sm">' . ($genre ? $genre . ' &middot; ' : '') . esc_html($date) . '</p>';
        echo '<strong style="font-size:1rem">' . $tf . '</strong>';
        if ($link) echo '<br><a href="' . esc_url($link) . '" target="_blank" rel="noopener" style="font-size:.8rem;color:#c9a84c;opacity:.7">Play / Listen</a>';
        echo '</div>';
        echo '<span class="nmc-status-pill" style="background:' . esc_attr($sc) . '">' . strtoupper(esc_html($status)) . '</span>';
        echo '</div>';
        if ($rn) echo '<p class="nmc-sub-note"><strong>A&amp;R:</strong> ' . esc_html($rn) . '</p>';
        if ($rd) echo '<p class="nmc-sub-date">Reviewed ' . esc_html(date('j M Y', strtotime($rd))) . '</p>';
        echo '</div>';
    }
    echo '</div>';
});

// ── 9. PORTAL CSS ────────────────────────────────────────────────────────────
add_action('wp_head', function(){
    if (!function_exists('is_account_page') || !is_account_page()) return;
    echo '<style>
/* NMC Portal */
.nmc-dw{padding:8px 0 4px}
.nmc-dw-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.nmc-badge{padding:3px 12px;border-radius:20px;font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.nmc-dw-title{font-size:1.55rem;margin:0 0 6px;line-height:1.2}
.nmc-dw-sub{opacity:.55;font-size:.9rem;margin:0 0 24px}
.nmc-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;margin:0 0 8px}
.nmc-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 10px;border:1px solid rgba(255,255,255,.1);border-radius:8px;text-decoration:none;color:inherit;font-size:.82rem;text-align:center;transition:border-color .15s,background .15s}
.nmc-card:hover{border-color:#c9a84c;background:rgba(201,168,76,.07);color:#c9a84c}
.nmc-card-ic{font-size:1.5rem;line-height:1}
.nmc-fg2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
@media(max-width:600px){.nmc-fg2{grid-template-columns:1fr}}
.nmc-type-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.nmc-chip{display:flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid rgba(255,255,255,.15);border-radius:20px;cursor:pointer;font-size:.82rem;transition:border-color .15s,background .15s}
.nmc-chip:hover,.nmc-chip-on{border-color:#c9a84c;background:rgba(201,168,76,.08)}
.nmc-chip input{accent-color:#c9a84c;margin:0}
.nmc-btn{display:inline-block;padding:11px 24px;background:#c9a84c;color:#000 !important;border:none;border-radius:5px;font-weight:700;cursor:pointer;font-size:.9rem;letter-spacing:.04em;text-decoration:none !important;transition:opacity .15s;line-height:1}
.nmc-btn:hover{opacity:.85}
.nmc-upload-zone{border:1px dashed rgba(255,255,255,.2);border-radius:6px;padding:16px;margin-bottom:14px;transition:border-color .15s}
.nmc-upload-zone:hover{border-color:#c9a84c}
.nmc-upload-tag{margin-left:8px;padding:2px 8px;background:rgba(201,168,76,.15);color:#c9a84c;border-radius:10px;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.nmc-subs-list{display:flex;flex-direction:column;gap:12px}
.nmc-sub-card{border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:16px 18px;transition:border-color .15s}
.nmc-sub-card:hover{border-color:rgba(255,255,255,.2)}
.nmc-sub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.nmc-eyebrow-sm{font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;opacity:.45;margin:0 0 4px}
.nmc-status-pill{padding:4px 12px;border-radius:12px;font-size:.68rem;font-weight:800;letter-spacing:.08em;color:#000;flex-shrink:0;margin-top:2px;white-space:nowrap}
.nmc-sub-note{margin:10px 0 0;font-size:.85rem;opacity:.75;background:rgba(255,255,255,.04);padding:8px 12px;border-radius:4px;border-left:3px solid #c9a84c}
.nmc-sub-date{margin:6px 0 0;font-size:.75rem;opacity:.4}
</style>';
}, 22);
