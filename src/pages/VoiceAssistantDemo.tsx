import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Mic, Navigation, MessageSquare, Star, Users, Phone, Mail, MapPin, Check, ArrowRight, Lightbulb, Zap, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import VapiVoiceInterface from '@/components/VapiVoiceInterface'

const VoiceAssistantDemo = () => {
  const navigate = useNavigate()
  const [isLoaded, setIsLoaded] = useState(false)
  
  // Get URL parameters for live assistant demo
  const urlParams = new URLSearchParams(window.location.search)
  const assistantId = urlParams.get('assistant')
  const assistantName = urlParams.get('name') || 'Demo Assistant'
  const isLiveDemo = !!assistantId

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Vapi Voice Interface */}
        <VapiVoiceInterface
          assistantId={assistantId || "NEW_ASSISTANT_ID_PLACEHOLDER"}
          publicKey={import.meta.env.VITE_VAPI_PUBLIC_KEY}
          position="right"
          theme="light"
          onSpeakingChange={(speaking) => console.log('Speaking:', speaking)}
          onTranscript={(transcript) => console.log('Transcript:', transcript)}
        />
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Dashboard</span>
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <h1 className="text-xl font-semibold text-gray-900">Voice Assistant Demo</h1>
            </div>
            <div className="flex items-center space-x-4">
              {isLoaded && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <Mic className="h-3 w-3 mr-1" />
                  {isLiveDemo ? `${assistantName} Ready` : 'Demo Assistant Ready'}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="hero" data-section="hero" className="py-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {isLiveDemo ? (
            <>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Live Demo:
                <br />
                <span className="text-yellow-300">{assistantName}</span>
              </h1>
              <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto">
                Your custom voice assistant is now active! Try speaking with it and test all the navigation features.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-4xl md:text-6xl font-bold mb-6">
                Experience Voice-Powered
                <br />
                <span className="text-yellow-300">Website Navigation</span>
              </h1>
              <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto">
                Try saying: "Scroll down", "Go to pricing section", "Click get started button", or ask questions about our features!
              </p>
            </>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-white text-blue-600 hover:bg-gray-100"
              data-action="get-started"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <ArrowRight className="mr-2 h-5 w-5" />
              Get Started
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-white text-white hover:bg-white hover:text-blue-600"
              data-action="learn-more"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Voice Commands Guide */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Try These Voice Commands</h2>
            <p className="text-lg text-gray-600">Click the microphone button and try these commands</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="text-center">
              <CardHeader>
                <Navigation className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <CardTitle className="text-lg">Navigation Commands</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>"Scroll down"</p>
                  <p>"Go to pricing section"</p>
                  <p>"Navigate to contact area"</p>
                  <p>"Show me features"</p>
                </div>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Mic className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <CardTitle className="text-lg">Interaction Commands</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>"Click get started button"</p>
                  <p>"Press learn more"</p>
                  <p>"Select contact us"</p>
                  <p>"Open pricing link"</p>
                </div>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <MessageSquare className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                <CardTitle className="text-lg">Conversation Memory</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>"What did we discuss earlier?"</p>
                  <p>"Remember my preferences"</p>
                  <p>"Continue our conversation"</p>
                  <p>"What was my last question?"</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" data-section="features" className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Powerful Features</h2>
            <p className="text-lg text-gray-600">Advanced voice assistant capabilities</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Lightbulb className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Smart Navigation</h3>
              <p className="text-gray-600">Voice-controlled scrolling, section navigation, and element interaction</p>
            </div>
            
            <div className="text-center">
              <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Multi-turn Memory</h3>
              <p className="text-gray-600">Persistent conversation context across multiple interactions</p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Shield className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Error Handling</h3>
              <p className="text-gray-600">Robust error handling for invalid commands and navigation requests</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" data-section="how-it-works" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-lg text-gray-600">Simple integration, powerful results</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-semibold">1</div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Voice Recognition</h3>
                  <p className="text-gray-600">Advanced speech-to-text processing captures user commands accurately</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-semibold">2</div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Command Processing</h3>
                  <p className="text-gray-600">AI interprets navigation commands and website interactions</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-semibold">3</div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">DOM Manipulation</h3>
                  <p className="text-gray-600">Direct website interaction through intelligent element selection</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-semibold">4</div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">Memory Persistence</h3>
                  <p className="text-gray-600">Conversation context saved for seamless multi-turn interactions</p>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-8">
              <h3 className="text-xl font-semibold mb-4">Integration Code</h3>
              <div className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm font-mono">
                <div>{'<script src="your-embed-url"></script>'}</div>
                <div className="mt-2">{'<div id="voiceai-assistant-demo"></div>'}</div>
                <div className="mt-2">{'VoiceAIAssistant.init({'}</div>
                <div className="ml-4">{'assistantId: "demo",'}</div>
                <div className="ml-4">{'vapiAssistantId: "your-id"'}</div>
                <div>{'});'}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" data-section="pricing" className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple Pricing</h2>
            <p className="text-lg text-gray-600">Choose the plan that works for you</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="relative">
              <CardHeader>
                <CardTitle className="text-xl">Starter</CardTitle>
                <CardDescription>Perfect for small websites</CardDescription>
                <div className="text-3xl font-bold mt-4">$29<span className="text-sm font-normal text-gray-500">/month</span></div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Up to 1,000 interactions</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Basic navigation</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Email support</li>
                </ul>
                <Button className="w-full mt-6" data-action="select-starter">Get Started</Button>
              </CardContent>
            </Card>

            <Card className="relative border-blue-500 shadow-lg">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <Badge className="bg-blue-500 text-white">Most Popular</Badge>
              </div>
              <CardHeader>
                <CardTitle className="text-xl">Professional</CardTitle>
                <CardDescription>Advanced features for growing businesses</CardDescription>
                <div className="text-3xl font-bold mt-4">$99<span className="text-sm font-normal text-gray-500">/month</span></div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Up to 10,000 interactions</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Advanced navigation & memory</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Priority support</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Custom voice options</li>
                </ul>
                <Button className="w-full mt-6" data-action="select-professional">Get Started</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Enterprise</CardTitle>
                <CardDescription>For large-scale deployments</CardDescription>
                <div className="text-3xl font-bold mt-4">Custom</div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Unlimited interactions</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />White-label solution</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Dedicated support</li>
                  <li className="flex items-center"><Check className="h-4 w-4 text-green-500 mr-2" />Custom integrations</li>
                </ul>
                <Button variant="outline" className="w-full mt-6" data-action="contact-sales">Contact Sales</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" data-section="contact" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Get In Touch</h2>
            <p className="text-lg text-gray-600">Ready to revolutionize your website with voice navigation?</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center">
                  <Phone className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Phone</h3>
                  <p className="text-gray-600">+1 (555) 123-4567</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 rounded-full w-12 h-12 flex items-center justify-center">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Email</h3>
                  <p className="text-gray-600">hello@voiceai.com</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="bg-purple-100 rounded-full w-12 h-12 flex items-center justify-center">
                  <MapPin className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Address</h3>
                  <p className="text-gray-600">123 Innovation Street<br />San Francisco, CA 94105</p>
                </div>
              </div>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
                <CardDescription>We'll get back to you within 24 hours</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">First Name</label>
                    <input className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Last Name</label>
                    <input className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input type="email" className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <textarea rows={4} className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"></textarea>
                </div>
                <Button className="w-full" data-action="send-message">Send Message</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">VoiceAI Platform</h3>
              <p className="text-gray-400">Revolutionizing website interaction through intelligent voice navigation.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">About</a></li>
                <li><a href="#" className="hover:text-white">Blog</a></li>
                <li><a href="#contact" className="hover:text-white">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <div className="flex space-x-4">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  <Users className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
          <Separator className="my-8 bg-gray-700" />
          <div className="text-center text-gray-400">
            <p>&copy; 2024 VoiceAI Platform. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default VoiceAssistantDemo