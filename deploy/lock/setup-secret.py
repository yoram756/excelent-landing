#!/usr/bin/env python3
"""Human-only secret entry; never print a secret or overwrite an existing one."""
import getpass
import os
import re
from pathlib import Path
p = Path('/docker/lp-lock-secrets/token')
if os.geteuid() != 0:
    raise SystemExit('Run as root')
if p.exists():
    raise SystemExit('Secret already exists; no change')
a = getpass.getpass('Paste NEW 48-character letters/digits secret (hidden): ')
b = getpass.getpass('Confirm NEW secret (hidden): ')
if a != b or not re.fullmatch(r'[A-Za-z0-9]{48}', a):
    raise SystemExit('Mismatch or invalid format; no change')
p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
if (p.parent.stat().st_mode & 0o777) != 0o700 or p.parent.stat().st_uid != 0:
    raise SystemExit('Secret directory must be root-owned mode 0700; no change')
fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
with os.fdopen(fd, 'w') as f:
    os.fchown(f.fileno(), 1000, 1000)
    f.write(a + '\n')
    f.flush()
    os.fsync(f.fileno())
print('Secret saved. No secret printed. Service not started.')
