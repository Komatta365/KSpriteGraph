@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" || exit /b 1

call npm install --prefix frontend
call cargo update --manifest-path src-tauri/Cargo.toml
where python >nul 2>nul
if not errorlevel 1 (
  call python -m pip install -r ai\requirements.txt
) else (
  where py >nul 2>nul
  if not errorlevel 1 (
    call py -3 -m pip install -r ai\requirements.txt
  ) else (
    where python3 >nul 2>nul
    if not errorlevel 1 (
      call python3 -m pip install -r ai\requirements.txt
    ) else (
      echo Python was not found in PATH. Install Python 3 and ensure "python" or "py" is available.
      popd
      exit /b 1
    )
  )
)
if errorlevel 1 (
  set "EXIT_CODE=%ERRORLEVEL%"
  popd
  exit /b %EXIT_CODE%
)

cd src-tauri
call ..\frontend\node_modules\.bin\tauri build --config tauri.conf.json
set "EXIT_CODE=%ERRORLEVEL%"

popd
exit /b %EXIT_CODE%
