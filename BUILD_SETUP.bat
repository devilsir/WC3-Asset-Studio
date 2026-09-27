@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Build - WC3 Asset Studio v1.4 Setup

echo ================================================================
echo  WC3 ASSET STUDIO v1.4 - BUILD INNO SETUP - FIXED R2
echo ================================================================
echo.

rem -----------------------------------------------------------------
rem Resolve Node/npm BEFORE changing to the source directory.
rem Calling only "npm.cmd" from another working directory can make
rem newer npm launchers resolve %%~dp0 incorrectly.
rem -----------------------------------------------------------------
set "NODE_EXE="
set "NPM_CMD="

if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"

if not defined NODE_EXE (
  for /f "delims=" %%I in ('where node.exe 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
)
if not defined NPM_CMD (
  for /f "delims=" %%I in ('where npm.cmd 2^>nul') do if not defined NPM_CMD set "NPM_CMD=%%~fI"
)

if not defined NODE_EXE (
  echo [ERRO] node.exe nao foi encontrado.
  echo Instale o Node.js LTS e tente novamente.
  pause
  exit /b 2
)
if not defined NPM_CMD (
  echo [ERRO] npm.cmd nao foi encontrado.
  echo Instale/repare o Node.js LTS e tente novamente.
  pause
  exit /b 2
)

echo Node: "%NODE_EXE%"
echo NPM : "%NPM_CMD%"
echo.

"%NODE_EXE%" --version
if errorlevel 1 (
  echo [ERRO] node.exe foi encontrado, mas nao executou corretamente.
  pause
  exit /b 2
)
call "%NPM_CMD%" --version
if errorlevel 1 (
  echo [ERRO] npm.cmd foi encontrado, mas nao executou corretamente.
  echo NPM detectado: "%NPM_CMD%"
  pause
  exit /b 2
)

set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles(x86)%\Inno Setup 7\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 7\ISCC.exe"
if not exist "%ISCC%" (
  echo [ERRO] ISCC.exe nao encontrado. Instale Inno Setup 6 ou 7.
  pause
  exit /b 3
)

echo Inno Setup: "%ISCC%"
echo.

echo [1/3] Instalando dependencias Electron...
pushd "%~dp0source"
call "%NPM_CMD%" install --no-audit --no-fund
if errorlevel 1 goto :npm_error

echo.
echo [2/3] Gerando aplicativo Windows x64...
if exist "dist" rmdir /s /q "dist"
call "%NPM_CMD%" run dist:dir
if errorlevel 1 goto :build_error
popd

if not exist "%~dp0source\dist\win-unpacked\WC3 Asset Studio.exe" (
  echo [ERRO] source\dist\win-unpacked\WC3 Asset Studio.exe nao foi gerado.
  pause
  exit /b 5
)

if exist "%~dp0output" rmdir /s /q "%~dp0output"

echo.
echo [3/3] Compilando Setup com Inno Setup...
"%ISCC%" "%~dp0WC3_Asset_Studio_v1.4.iss"
if errorlevel 1 (
  echo.
  echo [ERRO] Falha ao compilar o Setup.
  pause
  exit /b 6
)

echo.
echo ================================================================
echo PRONTO:
echo   %~dp0output\WC3 Asset Studio v1.4 Setup.exe
echo ================================================================
pause
exit /b 0

:npm_error
popd
echo.
echo [ERRO] npm install falhou.
echo NPM usado: "%NPM_CMD%"
echo.
echo Se aparecer um caminho como source\node_modules\npm\bin\npm-cli.js,
echo confirme que esta usando ESTE BUILD_SETUP.bat R2.
pause
exit /b 4

:build_error
popd
echo.
echo [ERRO] electron-builder falhou.
pause
exit /b 5
