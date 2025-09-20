import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VapiAccountCheckerProps {
  className?: string;
}

interface AccountInfo {
  publicKey: string;
  privateKeyPrefix: string;
  accountStatus: 'valid' | 'invalid' | 'checking' | 'error';
  error?: string;
}

const VapiAccountChecker: React.FC<VapiAccountCheckerProps> = ({ className = '' }) => {
  const [accountInfo, setAccountInfo] = useState<AccountInfo>({
    publicKey: '',
    privateKeyPrefix: '',
    accountStatus: 'checking'
  });
  const [isChecking, setIsChecking] = useState(false);

  const checkVapiAccount = async () => {
    setIsChecking(true);
    setAccountInfo(prev => ({ ...prev, accountStatus: 'checking' }));

    try {
      // Get public key from environment
      const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
      
      if (!publicKey) {
        setAccountInfo({
          publicKey: 'Not configured',
          privateKeyPrefix: 'Not configured',
          accountStatus: 'error',
          error: 'VITE_VAPI_PUBLIC_KEY not found in environment'
        });
        return;
      }

      // Test the keys by calling the check-assistant function with a dummy ID
      const { data: response, error } = await supabase.functions.invoke('check-assistant', {
        body: { assistantId: 'test-connection' }
      });

      console.log('Full response from check-assistant:', response);
      console.log('Error from check-assistant:', error);

      let privateKeyPrefix = 'Unknown';
      
      // Extract private key info from response
      if (response && response.keyInfo && response.keyInfo.privateKeyPrefix) {
        privateKeyPrefix = response.keyInfo.privateKeyPrefix;
        console.log('Found privateKeyPrefix in response:', privateKeyPrefix);
      } else if (error && error.message && error.message.includes('keyInfo')) {
        // Try to parse key info from error message
        try {
          const errorData = JSON.parse(error.message);
          if (errorData.keyInfo && errorData.keyInfo.privateKeyPrefix) {
            privateKeyPrefix = errorData.keyInfo.privateKeyPrefix;
            console.log('Found privateKeyPrefix in error:', privateKeyPrefix);
          }
        } catch (e) {
          console.log('Could not parse key info from error');
        }
      } else {
        console.log('No keyInfo found in response or error');
        console.log('Response structure:', JSON.stringify(response, null, 2));
        console.log('Error structure:', JSON.stringify(error, null, 2));
      }

      setAccountInfo({
        publicKey: `${publicKey.substring(0, 8)}...${publicKey.slice(-4)}`,
        privateKeyPrefix: privateKeyPrefix,
        accountStatus: 'valid'
      });

    } catch (error: any) {
      console.error('VAPI account check error:', error);
      
      // Try to extract key info even from error responses
      let privateKeyPrefix = 'Error';
      if (error.message) {
        try {
          const errorData = JSON.parse(error.message);
          if (errorData.keyInfo && errorData.keyInfo.privateKeyPrefix) {
            privateKeyPrefix = errorData.keyInfo.privateKeyPrefix;
          }
        } catch (e) {
          // If parsing fails, keep default
        }
      }
      
      setAccountInfo({
        publicKey: import.meta.env.VITE_VAPI_PUBLIC_KEY ? 
          `${import.meta.env.VITE_VAPI_PUBLIC_KEY.substring(0, 8)}...${import.meta.env.VITE_VAPI_PUBLIC_KEY.slice(-4)}` : 'Not configured',
        privateKeyPrefix: privateKeyPrefix,
        accountStatus: 'error',
        error: error.message || 'Failed to verify VAPI account'
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkVapiAccount();
  }, []);

  const getStatusIcon = () => {
    switch (accountInfo.accountStatus) {
      case 'valid':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'invalid':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'checking':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (accountInfo.accountStatus) {
      case 'valid':
        return <Badge variant="default" className="bg-green-100 text-green-800">Connected</Badge>;
      case 'invalid':
        return <Badge variant="destructive">Invalid Keys</Badge>;
      case 'error':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Check Failed</Badge>;
      case 'checking':
        return <Badge variant="outline">Checking...</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card className={`border-l-4 ${
      accountInfo.accountStatus === 'valid' ? 'border-l-green-500' : 
      accountInfo.accountStatus === 'error' ? 'border-l-yellow-500' : 
      'border-l-red-500'
    } ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            VAPI Account Status
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-muted-foreground">Public Key</p>
            <p className="font-mono text-xs bg-muted p-2 rounded">
              {accountInfo.publicKey}
            </p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground">Private Key</p>
            <p className="font-mono text-xs bg-muted p-2 rounded">
              {accountInfo.privateKeyPrefix}
            </p>
          </div>
        </div>
        
        {accountInfo.error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> {accountInfo.error}
            </p>
          </div>
        )}
        
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-sm text-blue-800">
            <strong>Info:</strong> Assistants created will be linked to the account using these keys. 
            Make sure these are your correct VAPI credentials.
          </p>
        </div>
        
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={checkVapiAccount}
            disabled={isChecking}
          >
            {isChecking ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default VapiAccountChecker;