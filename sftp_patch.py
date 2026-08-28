import paramiko
import os

HOST = '1109790.eu14.ssh.myftpupload.com'
PORT = 22
USER = 'client_e14bc964a_1109790'
PASS = 'UM=rtZhKb1EZxA'
REMOTE = 'html/wp-content/plugins/nmc-core/nmc-core.php'
LOCAL_PATCH = r'C:\Users\PACK&S~1\AppData\Local\Temp\claude\signal-os-clone\nmc_portal_patch.php'
LOCAL_DL    = r'C:\Users\PACK&S~1\AppData\Local\Temp\claude\signal-os-clone\nmc-core-dl.php'
LOCAL_UP    = r'C:\Users\PACK&S~1\AppData\Local\Temp\claude\signal-os-clone\nmc-core-patched.php'

# Connect
t = paramiko.Transport((HOST, PORT))
t.connect(username=USER, password=PASS)
sftp = paramiko.SFTPClient.from_transport(t)

# Download
print('Downloading nmc-core.php ...')
sftp.get(REMOTE, LOCAL_DL)
print(f'Downloaded: {os.path.getsize(LOCAL_DL)} bytes')

# Read current file
with open(LOCAL_DL, 'r', encoding='utf-8') as f:
    src = f.read()

# Read patch
with open(LOCAL_PATCH, 'r', encoding='utf-8') as f:
    patch = f.read()

# Check if already patched
if 'nmc_user_submit_track' in src:
    print('ALREADY PATCHED — nmc_user_submit_track found in file. Skipping.')
    sftp.close(); t.close()
    exit(0)

# Append
patched = src.rstrip() + '\n\n' + patch + '\n'

with open(LOCAL_UP, 'w', encoding='utf-8', newline='\n') as f:
    f.write(patched)

print(f'Patched file ready: {os.path.getsize(LOCAL_UP)} bytes')

# Upload
print('Uploading ...')
sftp.put(LOCAL_UP, REMOTE)
print('Upload complete.')

sftp.close()
t.close()
print('Done.')
