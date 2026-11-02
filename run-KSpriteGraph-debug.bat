@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" || exit /b 1

cd src-tauri
call ..\frontend\node_modules\.bin\tauri dev --config tauri.conf.json
set "EXIT_CODE=%ERRORLEVEL%"

popd
exit /b %EXIT_CODE%
