import { useAuth } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Dashboard from './Dashboard'

const Index = () => {
  const { isSignedIn, isLoaded } = useAuth()
  const navigate = useNavigate()
  const [shouldRedirect, setShouldRedirect] = useState(false)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setShouldRedirect(true)
      navigate('/auth')
    }
  }, [isLoaded, isSignedIn, navigate])

  // Don't render anything until Clerk is loaded
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show loading state during redirect
  if (shouldRedirect || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Redirecting...</p>
        </div>
      </div>
    )
  }

  return <Dashboard />
};

export default Index;
