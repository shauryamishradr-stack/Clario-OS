@echo off
echo Starting Clario Workspace locally on port 8080...
start http://localhost:8080/index.html
python -m http.server 8080
pause
