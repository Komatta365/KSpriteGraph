@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" || exit /b 1

call npm install --prefix frontend
call cargo update --manifest-path src-tauri/Cargo.toml

cd src-tauri
call ..\frontend\node_modules\.bin\tauri build --config tauri.conf.json
set "EXIT_CODE=%ERRORLEVEL%"

popd
exit /b %EXIT_CODE%
