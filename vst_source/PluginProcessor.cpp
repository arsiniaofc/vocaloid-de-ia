#include "PluginProcessor.h"
#include "PluginEditor.h"

MathSynthProcessor::MathSynthProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
     : AudioProcessor (BusesProperties()
                     #if ! JucePlugin_IsMidiEffect
                      #if ! JucePlugin_IsSynth
                       .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
                      #endif
                       .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
                     #endif
                       )
#endif
{
}

MathSynthProcessor::~MathSynthProcessor() {}

const juce::String MathSynthProcessor::getName() const { return JucePlugin_Name; }
bool MathSynthProcessor::acceptsMidi() const { return true; }
bool MathSynthProcessor::producesMidi() const { return true; }
bool MathSynthProcessor::isMidiEffect() const { return false; }
double MathSynthProcessor::getTailLengthSeconds() const { return 0.0; }
int MathSynthProcessor::getNumPrograms() { return 1; }
int MathSynthProcessor::getCurrentProgram() { return 0; }
void MathSynthProcessor::setCurrentProgram (int index) {}
const juce::String MathSynthProcessor::getProgramName (int index) { return {}; }
void MathSynthProcessor::changeProgramName (int index, const juce::String& newName) {}

void MathSynthProcessor::prepareToPlay (double sampleRate, int samplesPerBlock) {}
void MathSynthProcessor::releaseResources() {}

bool MathSynthProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
     && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;
    return true;
}

void MathSynthProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels  = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
        buffer.clear (i, 0, buffer.getNumSamples());
    
    // MIDI / Audio logic to bridge with web view could be added here
}

bool MathSynthProcessor::hasEditor() const { return true; }

juce::AudioProcessorEditor* MathSynthProcessor::createEditor()
{
    return new PluginEditor (*this);
}

void MathSynthProcessor::getStateInformation (juce::MemoryBlock& destData) {}
void MathSynthProcessor::setStateInformation (const void* data, int sizeInBytes) {}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new MathSynthProcessor();
}
