@echo off
chcp 65001 >nul
echo ============================================
echo   פריסת חוקי Firestore
echo   פרויקט: partani-27a2a
echo ============================================
echo.

set "RULES_URL=https://console.firebase.google.com/project/partani-27a2a/firestore/databases/-default-/rules"

echo [1] מנסה פריסה אוטומטית דרך Firebase CLI...
echo     (אם נכשל - עבור לשלב 2 למטה)
echo.
firebase deploy --only firestore:rules --project partani-27a2a
if %ERRORLEVEL% EQU 0 (
  echo.
  echo [הצלחה] חוקי Firestore עודכנו. רענן את האתר ונסה שוב.
  pause
  exit /b 0
)

echo.
echo ============================================
echo   הפריסה האוטומטית נכשלה
echo ============================================
echo.
echo אפשרות א: התחברות מחדש ל-CLI
echo   firebase logout
echo   firebase login
echo   .\deploy-firestore-rules.bat
echo.
echo אפשרות ב (מומלץ אם CLI לא עובד):
echo   1. נפתח את Firebase Console בדפדפן
echo   2. העתק את כל התוכן מקובץ firestore.rules
echo   3. הדבק בעורך החוקים ולחץ Publish
echo.
echo פותח את Firebase Console...
start "" "%RULES_URL%"
echo.
echo הקובץ לעריכה: %~dp0firestore.rules
echo.
pause
exit /b 1
