@echo off
rem ======================================================================
rem  PTO/PTA documents: copy from Google Drive to OneDrive
rem  Houston ISD Family and Community Engagement
rem
rem  What it does
rem    Copies the Google Drive folder the PTO/PTA tracker files documents into
rem    ("Parent Org Documents") to OneDrive, keeping the same campus folders.
rem    Every document, bank letters included, is in the campus folder.
rem    It only ADDS and UPDATES files. It never deletes anything in Google
rem    Drive or in OneDrive.
rem    If your Drive still has the old "Parent Org Bank Info" folder (used before
rem    October 2, 2026), its files are copied into the same campus folders, so
rem    nothing is missed.
rem
rem  How to use it
rem    Double-click this file and follow the menu. Keep it in a folder you
rem    will not move, for example Documents. Start with option 1 (Preview).
rem
rem  Needs
rem    Google Drive for desktop, signed in with the Google account that owns
rem    the Parent Org folders, and OneDrive signed in with a Houston ISD account.
rem ======================================================================
setlocal EnableExtensions
set "SELF=%~f0"
set "MODE=%~1"

rem ------------------ SETTINGS: change only if you need to ------------------
rem Where Google Drive for desktop shows your Drive, for example G:\My Drive
rem Leave blank and this file finds it by itself.
set "DRIVE_ROOT="
rem The Google Drive folder name. It matches the tracker. Do not change.
set "DOCS_NAME=Parent Org Documents"
rem The old bank folder, only used if it still exists in your Drive. Do not change.
set "OLD_BANK_NAME=Parent Org Bank Info"
rem Where the copy goes. Leave blank to use your Houston ISD OneDrive.
rem Example: set "DOCS_DEST=C:\Users\you\OneDrive - Houston Independent School District\FACE\Parent Org Documents"
rem Use no backslash at the end.
rem Documents go into the shared FACE Coordinators folder (campus folders land directly inside it).
rem Bank letters are in the campus folders too, so only people who may see bank letters
rem should have access to that OneDrive folder.
set "DOCS_DEST=C:\Users\P00305271\OneDrive - Houston Independent School District\FACE Coordinators - PTO - PTA Documents"
rem How often the automatic copy runs, in hours.
set "EVERY_HOURS=3"
rem ------------------ end of settings ------------------

set "TASKNAME=PTO-PTA copy to OneDrive"
set "LOGDIR=%LOCALAPPDATA%\PTO-PTA-OneDrive-Copy"
set "LOG=%LOGDIR%\copy-log.txt"
set "LASTRUN=%LOGDIR%\last-run.txt"
set "LISTONLY="
if not exist "%LOGDIR%\" mkdir "%LOGDIR%"
if exist "%LOG%" for %%F in ("%LOG%") do if %%~zF GTR 3000000 move /y "%LOG%" "%LOGDIR%\copy-log-old.txt" >nul

if /i "%MODE%"=="run" goto :run_scheduled
goto :menu

rem ----------------------------------------------------------------------
:run_scheduled
set "LISTONLY="
set "RUNLABEL=scheduled copy"
call :do_copy
exit /b %WORST%

rem ----------------------------------------------------------------------
:menu
cls
set "LASTLINE=Not run yet on this PC"
if exist "%LASTRUN%" set /p LASTLINE=<"%LASTRUN%"
set "AUTO=OFF"
schtasks /query /tn "%TASKNAME%" >nul 2>&1
if not errorlevel 1 set "AUTO=ON, every %EVERY_HOURS% hours while this PC is on and you are signed in"
echo.
echo   PTO/PTA documents: copy from Google Drive to OneDrive
echo   =====================================================
echo   Last copy:          %LASTLINE%
echo   Automatic copying:  %AUTO%
echo.
echo     1   Preview what would be copied (copies nothing)
echo     2   Copy now
echo     3   Turn on automatic copying
echo     4   Turn off automatic copying
echo     5   Open the log (what was copied, and any problems)
echo     6   Open the OneDrive folder
echo     Q   Quit
echo.
choice /c 123456Q /n /m "  Your choice: "
if errorlevel 7 goto :quit
if errorlevel 6 goto :opt6
if errorlevel 5 goto :opt5
if errorlevel 4 goto :opt4
if errorlevel 3 goto :opt3
if errorlevel 2 goto :opt2
goto :opt1

:opt1
set "LISTONLY=/L"
set "RUNLABEL=PREVIEW only, nothing was copied"
call :do_copy
echo.
echo   That was only a preview. Nothing was copied.
echo   Files listed above as New File or Newer would be copied by option 2.
echo.
pause
goto :menu

:opt2
set "LISTONLY="
set "RUNLABEL=manual copy"
call :do_copy
echo.
echo   Result: %RESULT%
echo.
pause
goto :menu

:opt3
schtasks /create /tn "%TASKNAME%" /tr "cmd /c start \"\" /min \"%SELF%\" run" /sc hourly /mo %EVERY_HOURS% /st 07:00 /f >nul 2>&1
if errorlevel 1 goto :opt3_fail
echo.
echo   Automatic copying is on. It runs every %EVERY_HOURS% hours, starting at 7:00 AM,
echo   whenever this PC is on and you are signed in. A small window appears
echo   in the taskbar while it runs. Do not move or rename this file.
echo.
pause
goto :menu
:opt3_fail
echo.
echo   Windows did not allow automatic copying for this account.
echo   You can still use option 2 whenever you want to copy. Ask HISD IT
echo   if you want it to run by itself.
echo.
pause
goto :menu

:opt4
schtasks /delete /tn "%TASKNAME%" /f >nul 2>&1
echo.
echo   Automatic copying is off. Option 2 still works any time.
echo.
pause
goto :menu

:opt5
if not exist "%LOG%" goto :nolog
start "" notepad "%LOG%"
goto :menu
:nolog
echo.
echo   There is no log yet. Run option 1 or option 2 first.
echo.
pause
goto :menu

:opt6
call :locate
if defined PROBLEM goto :opt6_fail
if not exist "%DOCS_DEST%\" goto :opt6_none
start "" "%DOCS_DEST%"
goto :menu
:opt6_none
echo.
echo   The OneDrive folder does not exist yet. Run option 2 first.
echo.
pause
goto :menu
:opt6_fail
echo.
echo   %PROBLEM%
echo.
pause
goto :menu

:quit
exit /b 0

rem ----------------------------------------------------------------------
rem  Finds Google Drive and OneDrive. Sets DRIVE_ROOT and DOCS_DEST,
rem  or sets PROBLEM to a plain sentence saying what is missing.
:locate
set "PROBLEM="
if not defined DRIVE_ROOT call :find_drive
if not defined DRIVE_ROOT set "PROBLEM=Could not find the Parent Org Documents folder in Google Drive for desktop. Make sure Google Drive for desktop is running and signed in with the account that owns the Parent Org folders. Or set DRIVE_ROOT at the top of this file."
if defined PROBLEM exit /b 0
set "OD=%OneDriveCommercial%"
if not defined OD set "OD=%OneDrive%"
if not defined DOCS_DEST if defined OD set "DOCS_DEST=%OD%\%DOCS_NAME% - Google Drive copy"
if not defined DOCS_DEST set "PROBLEM=OneDrive was not found on this PC. Sign in to OneDrive with your Houston ISD account, or set DOCS_DEST at the top of this file."
exit /b 0

:find_drive
for %%L in (G H I J K L M N O P Q R S T U V W X Y Z D E F) do if not defined DRIVE_ROOT if exist "%%L:\My Drive\%DOCS_NAME%\" set "DRIVE_ROOT=%%L:\My Drive"
exit /b 0

rem ----------------------------------------------------------------------
rem  Runs the copy (and the old bank folder, if it still exists). Sets WORST (0 to 7 is fine, 8 or more is a problem) and RESULT.
:do_copy
set "WORST=16"
call :locate
if defined PROBLEM goto :do_copy_problem
>>"%LOG%" echo.
>>"%LOG%" echo ===== %date% %time% - %RUNLABEL% =====
echo.
echo   Google Drive:  %DRIVE_ROOT%
echo   OneDrive:      %DOCS_DEST%
echo.
call :docopy "%DRIVE_ROOT%\%DOCS_NAME%" "%DOCS_DEST%" "Documents (bank letters included)"
set "WORST=%RC%"
if exist "%DRIVE_ROOT%\%OLD_BANK_NAME%\" call :docopy "%DRIVE_ROOT%\%OLD_BANK_NAME%" "%DOCS_DEST%" "Older bank letters (same campus folders)"
if exist "%DRIVE_ROOT%\%OLD_BANK_NAME%\" if %RC% GTR %WORST% set "WORST=%RC%"
set "RESULT=Done. Nothing went wrong."
if %WORST% GEQ 8 set "RESULT=PROBLEM: some files or folders could not be copied. Open the log for details."
if defined LISTONLY set "RESULT=Preview only, nothing was copied."
if defined LISTONLY exit /b 0
> "%LASTRUN%" echo %date% %time% - %RESULT%
exit /b 0
:do_copy_problem
set "RESULT=PROBLEM: %PROBLEM%"
echo.
echo   %RESULT%
>>"%LOG%" echo ===== %date% %time% - %RUNLABEL% =====
>>"%LOG%" echo %RESULT%
if defined LISTONLY exit /b 0
> "%LASTRUN%" echo %date% %time% - %RESULT%
exit /b 0

rem ----------------------------------------------------------------------
rem  Copies one folder. %1 = Google Drive folder, %2 = OneDrive folder, %3 = label.
rem  Sets RC (robocopy code: 0 to 7 is fine, 8 or more is a problem).
:docopy
set "SRC=%~1"
set "DST=%~2"
set "RC=16"
echo   ---- %~3 ----
echo   To: %DST%
if not exist "%SRC%\" goto :docopy_nosrc
for %%I in ("%DST%") do set "PARENT=%%~dpI"
if not exist "%PARENT%" goto :docopy_nodst
if not defined LISTONLY if not exist "%DST%\" mkdir "%DST%"
robocopy "%SRC%" "%DST%" /E /XO /FFT /R:2 /W:5 /NP /NDL /NJH /XJ /COPY:DT %LISTONLY% /XF *.gdoc *.gsheet *.gslides *.gform *.gdraw *.gmap *.gsite *.gscript *.gjam *.gshortcut desktop.ini Thumbs.db ~$* /LOG+:"%LOG%" /TEE
set "RC=%errorlevel%"
if defined LISTONLY exit /b 0
if %RC% GEQ 8 exit /b 0
if not exist "%DST%\" exit /b 0
> "%DST%\_Copy status.txt" echo Last copy from Google Drive: %date% %time%
>> "%DST%\_Copy status.txt" echo This folder is a backup copy. Add and review documents in Google Drive, not here.
>> "%DST%\_Copy status.txt" echo Files deleted or renamed in Google Drive are not removed from this copy.
exit /b 0
:docopy_nosrc
echo   Could not find this Google Drive folder: %SRC%
>>"%LOG%" echo Could not find this Google Drive folder: %SRC%
exit /b 0
:docopy_nodst
echo   Could not find the OneDrive location: %PARENT%
echo   Is OneDrive signed in? Or fix DOCS_DEST at the top of this file.
>>"%LOG%" echo Could not find the OneDrive location: %PARENT%
exit /b 0
