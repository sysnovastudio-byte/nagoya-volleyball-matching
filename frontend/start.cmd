@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. See README.md.
  pause
  exit /b 1
)
if not exist "node_modules" goto install
if not exist "package-lock.json" goto run
fc /b "package-lock.json" "node_modules\.start-lock.json" >nul 2>nul
if errorlevel 1 goto install
goto run

:install
echo Preparing the libraries. This needs an internet connection.
if exist "package-lock.json" (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 goto failed
copy /y "package-lock.json" "node_modules\.start-lock.json" >nul

:run
call npm run dev -- --open
exit /b 0

:failed
echo [ERROR] The libraries could not be prepared.
pause
exit /b 1
