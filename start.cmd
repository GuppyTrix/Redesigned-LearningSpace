@echo off
rem Start the local Learning Space redesign and open it in the default browser.
cd /d "%~dp0"
if not exist "app.js" (
  echo app.js missing - run this from the learningspace-tweak folder
  exit /b 1
)
start "" http://127.0.0.1:8790/
node app.js
