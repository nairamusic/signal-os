a// Netlify Scheduled Function — keeps Render free tier warm every 14 minutes
export default async () => {
  try {
      const r = await fetch('https://signal-os-api-m72h.onrender.com/health');
          console.log(`Signal//OS keep-warm: ${r.status}`);
            } catch (err) {
                console.error(`Signal//OS keep-warm failed: ${err.message}`);
                  }
                    return new Response('OK');
                    };

                    export const config = {
                      schedule: '*/14 * * * *',
                      };
                      
