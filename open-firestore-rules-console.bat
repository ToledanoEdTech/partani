@echo off
chcp 65001 >nul
echo פותח את עורך חוקי Firestore ב-Firebase Console...
echo.
echo הוראות:
echo 1. מחק את כל החוקים הקיימים בעורך
echo 2. פתח את הקובץ firestore.rules בתיקיית הפרויקט
echo 3. העתק הכל (Ctrl+A, Ctrl+C) והדבק בעורך (Ctrl+V)
echo 4. לחץ Publish / פרסם
echo 5. רענן את האתר ונסה שוב להוסיף תלמיד
echo.
start "" "https://console.firebase.google.com/project/partani-27a2a/firestore/databases/-default-/rules"
notepad "%~dp0firestore.rules"
pause
