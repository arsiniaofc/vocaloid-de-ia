cmake_minimum_required(VERSION 3.22)
project(MathSynth VERSION 1.0.0)

# Make sure JUCE_DIR is passed to CMake (e.g. -DJUCE_DIR="C:/JUCE")
if (NOT TARGET juce::juce_audio_utils)
    add_subdirectory("${JUCE_DIR}" "${CMAKE_BINARY_DIR}/JUCE" EXCLUDE_FROM_ALL)
endif()

juce_add_plugin(MathSynth
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Math
    PLUGIN_CODE Sth1
    FORMATS VST3 Standalone
    PRODUCT_NAME "MathSynth")

target_sources(MathSynth PRIVATE
    PluginProcessor.cpp
    PluginProcessor.h
    PluginEditor.cpp
    PluginEditor.h
)

target_compile_definitions(MathSynth
    PUBLIC
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
)

target_link_libraries(MathSynth
    PRIVATE
    juce::juce_audio_utils
    juce::juce_gui_extra
    PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags
)

# Gera o arquivo JuceHeader.h necessário para compatibilidade com macros antigas e importação simplificada
juce_generate_juce_header(MathSynth)
