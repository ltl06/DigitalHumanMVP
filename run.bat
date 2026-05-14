@echo off
pushd %~dp0
if errorlevel 1 goto :EOF

echo [1] Install dependencies...
pip install -r backend\requirements.txt -q
echo [OK]

echo.
echo === DigitalHuman MVP ===
echo 1 = Full (backend + frontend)
echo 2 = Backend only
echo 3 = Frontend only
echo.
set /p n="Choice [1/2/3]: "

if "%n%"=="1" (
    start cmd /k ".\.venv\Scripts\python.exe backend\serve.py"
    start cmd /k "cd /d "%~dp0frontend" && npm run dev"
    goto :EOF
)
if "%n%"=="2" (
    .\.venv\Scripts\python.exe backend\serve.py
    goto :EOF
)
if "%n%"=="3" (
    cd frontend
    call npm run dev
    goto :EOF
)
echo Invalid.
popd
