#pragma once
#include <JuceHeader.h>
#include "PluginProcessor.h"

class PluginEditor  : public juce::AudioProcessorEditor
{
public:
    PluginEditor (MathSynthProcessor&);
    ~PluginEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    MathSynthProcessor& audioProcessor;
    juce::WebBrowserComponent webBrowser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginEditor)
};
