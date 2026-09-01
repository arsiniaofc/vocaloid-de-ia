#include "PluginProcessor.h"
#include "PluginEditor.h"

PluginEditor::PluginEditor (MathSynthProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p),
      webBrowser (juce::WebBrowserComponent::Options()
                  .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
                  .withWinWebView2Options (juce::WebBrowserComponent::Options::WinWebView2()
                                           .withUserDataFolder (juce::File::getSpecialLocation (juce::File::tempDirectory))))
{
    addAndMakeVisible(webBrowser);
    
    // Pass messages from Web to C++
    // We bind a JS message callback to interact with the C++ host
    // In actual usage, point this to http://localhost:3000 during dev,
    // or a bundled local HTML file in production.
    webBrowser.goToURL("http://localhost:3000");

    setSize (1000, 700);
}

PluginEditor::~PluginEditor()
{
}

void PluginEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colours::black);
}

void PluginEditor::resized()
{
    webBrowser.setBounds (getLocalBounds());
}
