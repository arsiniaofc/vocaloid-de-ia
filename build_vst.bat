@echo off
echo ========================================================
echo MathSynth VST Build Script
echo ========================================================
echo This script requires CMake, Visual Studio, and JUCE to be installed.
echo Set the JUCE_PATH variable below to your JUCE directory.
echo.

set JUCE_PATH=C:\Users\Moita\Documents\JUCE
set BUILD_DIR=build_vst

if not exist "%JUCE_PATH%\CMakeLists.txt" (
    echo [ERROR] JUCE not found at %JUCE_PATH%.
    echo Please edit this script and set JUCE_PATH to your JUCE installation folder.
    pause
    exit /b 1
)

if not exist %BUILD_DIR% mkdir %BUILD_DIR%
cd %BUILD_DIR%

echo Generating Visual Studio project...
cmake -DJUCE_DIR="%JUCE_PATH%" ..\vst_source

if %errorlevel% neq 0 (
    echo [ERROR] CMake generation failed!
    pause
    exit /b %errorlevel%
)

echo Compiling VST3 Plugin...
cmake --build . --config Release

if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo Build finished! 
echo The VST3 file should be in %BUILD_DIR%\MathSynth_artefacts\Release\VST3\
pause
