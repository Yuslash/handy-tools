# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Bench backend.

Built with:  .venv/Scripts/pyinstaller backend.spec --noconfirm
Output:      dist/backend.exe  (shipped as extraResources by electron-builder)
"""

from PyInstaller.utils.hooks import collect_submodules, copy_metadata

# imageio (and friends) call importlib.metadata.version() on themselves at
# import time. PyInstaller does not bundle .dist-info unless asked, so without
# this the frozen build dies with PackageNotFoundError before serving anything.
datas = []
for pkg in ('imageio', 'imageio_ffmpeg', 'moviepy', 'proglog', 'numpy', 'yt_dlp'):
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

# uvicorn, fastapi and yt-dlp all resolve pieces at runtime, so static analysis
# misses them. yt-dlp's extractors especially — without them every URL fails
# with "Unsupported URL" in the packaged build only.
hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops.auto',
    'uvicorn.loops.asyncio',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.lifespan.on',
    'uvicorn.lifespan.off',
    'websockets',
    'websockets.legacy',
    'moviepy',
    'proglog',
    'imageio',
    'imageio_ffmpeg',
    'cv2',
    'numpy',
]
hiddenimports += collect_submodules('yt_dlp')
hiddenimports += collect_submodules('encodings')

a = Analysis(
    ['app/api/server.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Heavy libraries this backend never touches.
        'torch', 'torchvision', 'torchaudio',
        'tensorflow', 'keras', 'tensorboard',
        'scipy', 'pandas', 'matplotlib', 'sympy',
        'pytest',
        'IPython', 'notebook', 'jupyter',
        'sklearn', 'transformers', 'huggingface_hub',
        'tkinter',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    # UPX corrupts some native extensions (notably cv2) and saves little here.
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    # Console stays on so stdout/stderr reach Electron; the window itself is
    # hidden by spawning with windowsHide.
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
