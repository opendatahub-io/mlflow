# Establish SSH to localhost for test_sftp_artifact_repo.py
#
# GitHub Actions containers set HOME=/github/home even when whoami is root.
# The SSH client reads keys from $HOME/.ssh; sshd looks up root's
# authorized_keys from /etc/passwd (/root/.ssh). Both must have the key.
mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [ ! -f ~/.ssh/id_rsa ]; then
  ssh-keygen -t rsa -N '' -f ~/.ssh/id_rsa
fi
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_rsa

# sshd authenticates root from /root/.ssh, not $HOME (which may differ).
mkdir -p /root/.ssh
chmod 700 /root/.ssh
cat ~/.ssh/id_rsa.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# Wait until sshd accepts connections. In the UBI container job, sshd is
# started in an earlier step and may not be listening yet (or may have died).
i=0
while [ "$i" -lt 30 ]; do
  if ssh-keyscan -T 2 127.0.0.1 2>/dev/null | grep -q ssh-; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

# Record host keys for both names ssh may use. A type mismatch or scanning
# only "localhost" while the client connects to 127.0.0.1 shows up as
# "Host key verification failed".
ssh-keyscan -H -t rsa,ecdsa,ed25519 localhost 127.0.0.1 >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 600 ~/.ssh/known_hosts

# Test as root with the client identity in $HOME/.ssh (not /root/.ssh).
ssh -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey \
  -i ~/.ssh/id_rsa root@127.0.0.1 exit
export LOGNAME=$(whoami)
