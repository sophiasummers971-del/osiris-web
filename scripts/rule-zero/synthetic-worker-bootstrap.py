"""Linux x86_64 disposable fixture launcher. No secrets or live agents."""
import ctypes
import errno
import os
import platform
import resource
import json
import socket
import sys

if platform.system() != "Linux" or platform.machine() != "x86_64" or len(sys.argv) != 4:
    raise SystemExit("UNSUPPORTED_SYNTHETIC_ISOLATION")

class Filter(ctypes.Structure):
    _fields_ = [("code", ctypes.c_ushort), ("jt", ctypes.c_ubyte), ("jf", ctypes.c_ubyte), ("k", ctypes.c_uint)]

class Program(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(Filter))]

# Architecture check also rejects x32/compat syscall-number bypasses.
rules = [Filter(0x20, 0, 0, 4), Filter(0x15, 1, 0, 0xc000003e), Filter(0x06, 0, 0, 0x80000000),
         Filter(0x20, 0, 0, 0), Filter(0x45, 0, 1, 0x40000000), Filter(0x06, 0, 0, 0x80000000)]
# Deny new network endpoints, cross-process interference, namespace/mount changes
# and io_uring network bypasses. IPC uses only the already inherited parent pipe.
for number in [41, 42, 43, 49, 50, 53, 57, 58, 62, 101, 129, 155, 161, 165, 166, 200, 234,
               272, 288, 297, 304, 308, 310, 311, 321, 322, 424, 425, 426, 427, 434, 438]:
    rules += [Filter(0x15, 0, 1, number), Filter(0x06, 0, 0, 0x50000 | errno.EPERM)]
# clone may create runtime threads, never a new process. The kernel also
# requires CLONE_VM/CLONE_SIGHAND with CLONE_THREAD. clone3 uses a pointed-to
# struct the BPF filter cannot inspect: deny with ENOSYS so libc can fall back
# to the inspectable, thread-only clone syscall.
rules += [Filter(0x15, 0, 4, 56), Filter(0x20, 0, 0, 16),
          Filter(0x45, 1, 0, 0x10000), Filter(0x06, 0, 0, 0x50000 | errno.EPERM),
          Filter(0x06, 0, 0, 0x7fff0000)]
rules += [Filter(0x15, 0, 1, 435), Filter(0x06, 0, 0, 0x50000 | errno.ENOSYS)]
rules += [Filter(0x06, 0, 0, 0x7fff0000)]
array = (Filter * len(rules))(*rules)
program = Program(len(rules), array)
libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(38, 1, 0, 0, 0) != 0:
    raise SystemExit("NO_NEW_PRIVS_UNAVAILABLE")
target_uid = int(sys.argv[3])
if os.geteuid() != target_uid:
    os.setgroups([])
    os.setresgid(target_uid, target_uid, target_uid)
    os.setresuid(target_uid, target_uid, target_uid)
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
if libc.prctl(22, 2, ctypes.byref(program), 0, 0) != 0:
    raise SystemExit("SECCOMP_UNAVAILABLE")
# A dedicated bootstrap-only evidence pipe is closed before agent code starts.
# It cannot be overwritten by a later worker IPC message.
status = {}
with open("/proc/self/status", encoding="utf8") as handle:
    for line in handle:
        if line.startswith(("Uid:", "CapEff:", "NoNewPrivs:", "Seccomp:")):
            name, value = line.split(":", 1)
            status[name] = value.strip()
try:
    socket.socket()
    status["networkDenied"] = False
except PermissionError:
    status["networkDenied"] = True
try:
    os.kill(os.getppid(), 0)
    status["parentSignalDenied"] = False
except PermissionError:
    status["parentSignalDenied"] = True
status["pid"] = os.getpid()
os.write(4, (json.dumps(status) + "\n").encode())
os.close(4)
os.set_inheritable(3, True)
worker = os.path.abspath(sys.argv[2])
os.execve(sys.argv[1], [sys.argv[1], "--permission", "--no-experimental-sqlite", "--allow-fs-read=" + worker,
                       "--disallow-code-generation-from-strings", "--max-old-space-size=32", worker], os.environ)
