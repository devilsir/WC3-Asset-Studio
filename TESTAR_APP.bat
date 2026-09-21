@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title WC3 Asset Studio v1.3 - Teste direto

cls
echo ================================================================
echo  WC3 ASSET STUDIO v1.3 - TESTAR SEM MONTAR SETUP
echo ================================================================
echo.

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
  echo [ERRO] Node.js nao foi encontrado.
  echo Instale o Node.js LTS e execute este BAT novamente.
  echo.
  pause
  exit /b 2
)
if not defined NPM_CMD (
  echo [ERRO] npm.cmd nao foi encontrado.
  echo Instale/repare o Node.js LTS e execute este BAT novamente.
  echo.
  pause
  exit /b 2
)

if not exist "%~dp0source\package.json" (
  echo [ERRO] source\package.json nao foi encontrado.
  echo Mantenha este BAT na raiz do projeto WC3 Asset Studio.
  echo.
  pause
  exit /b 3
)

echo Node: "%NODE_EXE%"
echo NPM : "%NPM_CMD%"
echo.

pushd "%~dp0source"

rem Instala as dependencias apenas quando realmente faltarem.
if not exist "node_modules\.package-lock.json" goto :install_dependencies
if not exist "node_modules\electron\package.json" goto :install_dependencies
goto :check_electron_runtime

:install_dependencies
echo [DEPENDENCIAS] Instalando dependencias do projeto...
call "%NPM_CMD%" install --no-audit --no-fund
if errorlevel 1 goto :dependency_error

:check_electron_runtime
rem O ZIP do source pode conter node_modules sem o binario especifico do Windows.
rem Nesse caso baixa/repara somente o runtime do Electron na primeira execucao.
if exist "node_modules\electron\dist\electron.exe" goto :launch

echo [ELECTRON] Runtime Windows nao encontrado. Preparando uma vez...
call "%NPM_CMD%" rebuild electron
if errorlevel 1 (
  echo [ELECTRON] npm rebuild nao concluiu. Tentando instalador do Electron...
)

if exist "node_modules\electron\dist\electron.exe" goto :launch

if exist "node_modules\electron\install.js" (
  "%NODE_EXE%" "node_modules\electron\install.js"
)

if exist "node_modules\electron\dist\electron.exe" goto :launch

echo [ELECTRON] Runtime ainda ausente. Executando npm install para reparar...
call "%NPM_CMD%" install --no-audit --no-fund
if errorlevel 1 goto :dependency_error

if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo [ERRO] Nao foi possivel preparar o Electron para Windows.
  echo Verifique sua internet, firewall/antivirus e tente novamente.
  echo.
  popd
  pause
  exit /b 4
)

:launch
cls
echo ================================================================
echo  WC3 ASSET STUDIO v1.3 - EXECUCAO DIRETA
echo ================================================================
echo.
echo Projeto: %CD%
echo.
echo Feche o WC3 Asset Studio para encerrar este terminal.
echo Logs e erros do Electron vao aparecer aqui.
echo.

set "ELECTRON_ENABLE_LOGGING=1"
set "ELECTRON_ENABLE_STACK_DUMPING=1"

call "%NPM_CMD%" start
set "APP_EXIT=%ERRORLEVEL%"
popd

if not "%APP_EXIT%"=="0" (
  echo.
  echo [ERRO] O aplicativo terminou com codigo %APP_EXIT%.
  echo Veja as mensagens acima.
  echo.
  pause
  exit /b %APP_EXIT%
)

exit /b 0

:dependency_error
popd
echo.
echo [ERRO] Falha ao preparar as dependencias.
echo Verifique as mensagens acima.
echo.
pause
exit /b 5
