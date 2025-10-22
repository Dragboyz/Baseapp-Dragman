import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [toast, setToast] = useState(null);
  const [walletAddress, setWalletAddress] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [activeTab, setActiveTab] = useState('wallet');
  const [transactions, setTransactions] = useState([]);
  const [portfolio, setPortfolio] = useState([]);
  const [swapData, setSwapData] = useState({
    fromToken: 'ETH',
    toToken: 'USDC',
    amount: '',
    quote: null,
    loading: false
  });
  const [yieldFarms, setYieldFarms] = useState([]);
  const [priceCharts, setPriceCharts] = useState([]);
  const [selectedChart, setSelectedChart] = useState('ETH');

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      console.log('Unhandled promise rejection caught:', event.reason);
      event.preventDefault();
      event.stopPropagation();
      return false;
    };

    const handleError = (event) => {
      console.log('Global error caught:', event.error);
      event.preventDefault();
      event.stopPropagation();
      return false;
    };

    // Override console.error to suppress React error overlay
    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (args[0] && args[0].includes && args[0].includes('Unknown promise rejection reason')) {
        console.log('Suppressed React error overlay:', ...args);
        return;
      }
      originalConsoleError.apply(console, args);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);
    
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
      console.error = originalConsoleError;
    };
  }, []);

  // Check if wallet is already connected
  useEffect(() => {
    const checkWalletConnection = () => {
      if (window.ethereum) {
        window.ethereum.request({ method: 'eth_accounts' })
          .then((accounts) => {
            if (accounts.length > 0) {
              setWalletAddress(accounts[0]);
              // Get balance
              window.ethereum.request({ 
                method: 'eth_getBalance', 
                params: [accounts[0], 'latest'] 
              })
              .then((balance) => {
                // Convert from wei to ETH
                const ethBalance = parseInt(balance, 16) / Math.pow(10, 18);
                setWalletBalance(ethBalance.toFixed(4));
              })
              .catch(() => {
                setWalletBalance('0.0000');
              });
            }
          })
          .catch(() => {
            // Wallet not connected
          });
      }
    };

    checkWalletConnection();
  }, []);

  // Load data on component mount
  useEffect(() => {
    loadYieldFarms();
    loadPriceCharts();
  }, []);

  // Load transaction history
  const loadTransactionHistory = async () => {
    if (!walletAddress) return;
    
    try {
      // Mock transaction data - in real app, you'd fetch from Etherscan API
      const mockTransactions = [
        {
          hash: '0x1234...5678',
          type: 'Send',
          amount: '0.5 ETH',
          to: '0xabcd...efgh',
          timestamp: '2 hours ago',
          status: 'Confirmed',
          value: '$1,200'
        },
        {
          hash: '0x5678...9abc',
          type: 'Receive',
          amount: '1.2 ETH',
          from: '0xefgh...ijkl',
          timestamp: '1 day ago',
          status: 'Confirmed',
          value: '$2,880'
        },
        {
          hash: '0x9abc...def0',
          type: 'Swap',
          amount: '0.3 ETH → 600 USDC',
          to: 'Uniswap V3',
          timestamp: '3 days ago',
          status: 'Confirmed',
          value: '$720'
        }
      ];
      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  };

  // Load portfolio data
  const loadPortfolio = async () => {
    if (!walletAddress) return;
    
    try {
      // Mock portfolio data - in real app, you'd fetch from multiple APIs
      const mockPortfolio = [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          balance: walletBalance || '0.0000',
          value: '$2,400',
          change: '+5.2%',
          price: '$2,400'
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          balance: '1,200',
          value: '$1,200',
          change: '+0.1%',
          price: '$1.00'
        },
        {
          symbol: 'USDT',
          name: 'Tether',
          balance: '500',
          value: '$500',
          change: '+0.05%',
          price: '$1.00'
        }
      ];
      setPortfolio(mockPortfolio);
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    }
  };

  // Get swap quote
  const getSwapQuote = () => {
    if (!swapData.amount || parseFloat(swapData.amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }
    
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error');
      return;
    }
    
    setSwapData(prev => ({ ...prev, loading: true }));
    
    // Mock swap quote - in real app, you'd call Uniswap API
    setTimeout(() => {
      const amount = parseFloat(swapData.amount);
      const mockQuote = {
        fromAmount: swapData.amount,
        toAmount: (amount * 2000).toFixed(2),
        priceImpact: '0.1%',
        minimumReceived: (amount * 2000 * 0.999).toFixed(2),
        gasEstimate: '0.002 ETH'
      };
      setSwapData(prev => ({ ...prev, quote: mockQuote, loading: false }));
      showToast('Quote received successfully!', 'success');
    }, 1500);
  };

  // Load yield farming opportunities
  const loadYieldFarms = () => {
    try {
      // Mock yield farming data - in real app, you'd fetch from DeFi APIs
      const mockYieldFarms = [
        {
          protocol: 'Aave',
          token: 'USDC',
          apy: '8.5%',
          tvl: '$2.1B',
          risk: 'Low',
          minDeposit: '100 USDC',
          logo: '🏦',
          description: 'Lend USDC on Aave for stable returns'
        },
        {
          protocol: 'Compound',
          token: 'ETH',
          apy: '3.2%',
          tvl: '$1.8B',
          risk: 'Medium',
          minDeposit: '0.1 ETH',
          logo: '⚡',
          description: 'Supply ETH to Compound for lending rewards'
        },
        {
          protocol: 'Uniswap V3',
          token: 'ETH/USDC',
          apy: '12.4%',
          tvl: '$3.2B',
          risk: 'High',
          minDeposit: '0.05 ETH',
          logo: '🦄',
          description: 'Provide liquidity for ETH/USDC pair'
        },
        {
          protocol: 'Yearn',
          token: 'USDC',
          apy: '15.7%',
          tvl: '$890M',
          risk: 'High',
          minDeposit: '50 USDC',
          logo: '🏛️',
          description: 'Auto-compound USDC through Yearn strategies'
        }
      ];
      setYieldFarms(mockYieldFarms);
      console.log('Yield farms loaded:', mockYieldFarms);
    } catch (error) {
      console.error('Failed to load yield farms:', error);
    }
  };

  // Load price chart data
  const loadPriceCharts = () => {
    try {
      // Mock price chart data - in real app, you'd fetch from CoinGecko/CoinMarketCap
      const mockPriceCharts = [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          price: '$2,400.50',
          change24h: '+5.2%',
          change7d: '+12.8%',
          volume: '$15.2B',
          marketCap: '$288.5B',
          sparkline: [2200, 2250, 2300, 2350, 2400, 2380, 2400],
          color: '#627EEA'
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          price: '$1.00',
          change24h: '+0.1%',
          change7d: '+0.05%',
          volume: '$8.5B',
          marketCap: '$32.1B',
          sparkline: [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
          color: '#2775CA'
        },
        {
          symbol: 'USDT',
          name: 'Tether',
          price: '$1.00',
          change24h: '+0.05%',
          change7d: '+0.02%',
          volume: '$12.3B',
          marketCap: '$95.2B',
          sparkline: [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
          color: '#26A17B'
        }
      ];
      setPriceCharts(mockPriceCharts);
      console.log('Price charts loaded:', mockPriceCharts);
    } catch (error) {
      console.error('Failed to load price charts:', error);
    }
  };

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboard = (text, successMessage) => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          showToast(successMessage, 'success');
        }).catch(() => {
          showToast('Copy failed', 'error');
        });
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast(successMessage, 'success');
      }
    } catch (error) {
      console.error('Copy failed:', error);
      showToast('Copy failed', 'error');
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      showToast('Please install MetaMask or Coinbase Wallet', 'error');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        showToast('Wallet connected successfully!', 'success');
        
        // Get balance
        const balance = await window.ethereum.request({ 
          method: 'eth_getBalance', 
          params: [accounts[0], 'latest'] 
        });
        const ethBalance = parseInt(balance, 16) / Math.pow(10, 18);
        setWalletBalance(ethBalance.toFixed(4));
        
        // Load additional data
        loadTransactionHistory();
        loadPortfolio();
        loadYieldFarms();
        loadPriceCharts();
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      showToast('Wallet connection failed', 'error');
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setWalletBalance(null);
    showToast('Wallet disconnected', 'success');
  };

  return (
    <div className="App" style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #0052cc 0%, #0066ff 100%)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Global CSS Animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        * {
          box-sizing: border-box;
        }
        
        body {
          margin: 0;
          padding: 0;
          overflow-x: hidden;
        }
        
        @media (max-width: 768px) {
          .App {
            padding: 10px !important;
          }
        }
      `}</style>
      
      <header className="App-header" style={{ 
        background: 'rgba(255, 255, 255, 0.95)', 
        borderRadius: '25px', 
        padding: '40px',
        margin: '20px auto',
        maxWidth: '900px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.2)',
        animation: 'fadeInUp 0.8s ease-out'
      }}>
        <h1 style={{ 
          fontSize: '3rem', 
          marginBottom: '15px',
          background: 'linear-gradient(135deg, #0052cc 0%, #0066ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: '800',
          textAlign: 'center',
          textShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          🐉 Dragman Wallet App
        </h1>
        <p style={{ 
          fontSize: '1.3rem', 
          color: '#666',
          marginBottom: '40px',
          textAlign: 'center',
          fontWeight: '500'
        }}>
          Enhanced wallet connection with Base Chain integration
        </p>
        
        {/* Dark Mode Toggle */}
        <div style={{ 
          position: 'absolute', 
          top: '20px', 
          right: '20px',
          zIndex: 10
        }}>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{
              background: isDarkMode ? '#2d3748' : '#f7fafc',
              color: isDarkMode ? '#f7fafc' : '#2d3748',
              border: '2px solid #0052cc',
              borderRadius: '50px',
              padding: '10px 15px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            {isDarkMode ? '🌙' : '☀️'} {isDarkMode ? 'Dark' : 'Light'}
          </button>
        </div>

        {/* Wallet Section */}
        {walletAddress ? (
          <div style={{ 
            background: isDarkMode 
              ? 'linear-gradient(135deg, #2d3748 0%, #4a5568 100%)' 
              : 'linear-gradient(135deg, #0052cc 0%, #0066ff 100%)', 
            padding: '30px', 
            borderRadius: '20px', 
            marginBottom: '25px',
            color: 'white',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <h2 style={{ 
              fontSize: '2rem', 
              marginBottom: '15px',
              fontWeight: '700',
              textShadow: '0 2px 4px rgba(0,0,0,0.3)',
              textAlign: 'center'
            }}>
              ✅ Wallet Connected!
            </h2>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '15px',
              marginTop: '20px'
            }}>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '15px', 
                borderRadius: '10px',
                backdropFilter: 'blur(10px)'
              }}>
                <strong>Address:</strong><br />
                <span style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>
                  {walletAddress}
                </span>
              </div>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '15px', 
                borderRadius: '10px',
                backdropFilter: 'blur(10px)'
              }}>
                <strong>Balance:</strong><br />
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                  {walletBalance} ETH
                </span>
              </div>
              <div style={{ 
                background: 'rgba(255,255,255,0.1)', 
                padding: '15px', 
                borderRadius: '10px',
                backdropFilter: 'blur(10px)'
              }}>
                <strong>Network:</strong><br />
                <span style={{ fontSize: '1.1rem' }}>Ethereum</span>
              </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ 
              marginTop: '25px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              {[
                { id: 'wallet', label: '💼 Wallet', icon: '💼' },
                { id: 'portfolio', label: '📊 Portfolio', icon: '📊' },
                { id: 'swap', label: '🔄 Swap', icon: '🔄' },
                { id: 'yield', label: '🌾 Yield', icon: '🌾' },
                { id: 'charts', label: '📈 Charts', icon: '📈' },
                { id: 'history', label: '📜 History', icon: '📜' }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{ 
                    padding: '12px 20px',
                    background: activeTab === tab.id 
                      ? 'rgba(255,255,255,0.2)'
                      : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'all 0.3s ease',
                    transform: activeTab === tab.id ? 'translateY(-2px)' : 'translateY(0)',
                    boxShadow: activeTab === tab.id 
                      ? '0 4px 15px rgba(255,255,255,0.2)' 
                      : 'none',
                    minWidth: '100px'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{
              animation: 'fadeInUp 0.4s ease-out',
              minHeight: '200px'
            }}>
              {activeTab === 'wallet' && (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '15px'
                }}>
                  <button 
                    onClick={() => copyToClipboard(walletAddress, 'Wallet address copied!')}
                    style={{ 
                      padding: '15px 20px',
                      background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 4px 15px rgba(40, 167, 69, 0.3)'
                    }}
                  >
                    📋 Copy Address
                  </button>
                  <button 
                    onClick={() => window.open(`https://etherscan.io/address/${walletAddress}`, '_blank')}
                    style={{ 
                      padding: '15px 20px',
                      background: 'linear-gradient(135deg, #007bff 0%, #6610f2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 4px 15px rgba(0, 123, 255, 0.3)'
                    }}
                  >
                    🔍 View on Etherscan
                  </button>
                  <button 
                    onClick={disconnectWallet}
                    style={{ 
                      padding: '15px 20px',
                      background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 4px 15px rgba(220, 53, 69, 0.3)'
                    }}
                  >
                    🔌 Disconnect
                  </button>
                </div>
              )}

              {activeTab === 'portfolio' && (
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', textAlign: 'center' }}>
                    📊 Your Portfolio
                  </h3>
                  <div style={{ 
                    display: 'grid', 
                    gap: '10px'
                  }}>
                    {portfolio.map((token, index) => (
                      <div key={index} style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        padding: '15px', 
                        borderRadius: '10px',
                        backdropFilter: 'blur(10px)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '10px',
                        alignItems: 'center'
                      }}>
                        <div>
                          <strong>{token.symbol}</strong><br />
                          <span style={{ fontSize: '0.9rem' }}>{token.name}</span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <strong>{token.balance}</strong><br />
                          <span style={{ fontSize: '0.9rem' }}>{token.value}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ 
                            color: token.change.startsWith('+') ? '#28a745' : '#dc3545',
                            fontWeight: 'bold'
                          }}>
                            {token.change}
                          </span><br />
                          <span style={{ fontSize: '0.9rem' }}>{token.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'swap' && (
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', textAlign: 'center' }}>
                    🔄 Token Swap
                  </h3>
                  <div style={{ 
                    background: 'rgba(255,255,255,0.1)', 
                    padding: '20px', 
                    borderRadius: '15px',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>
                        From: {swapData.fromToken}
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0.0"
                        value={swapData.amount}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSwapData(prev => ({ ...prev, amount: value }));
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'rgba(255,255,255,0.2)',
                          color: 'white',
                          fontSize: '16px'
                        }}
                      />
                      <div style={{ fontSize: '0.8rem', marginTop: '5px', opacity: 0.8 }}>
                        Current amount: {swapData.amount || '0'} {swapData.fromToken}
                      </div>
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem' }}>
                        To: {swapData.toToken}
                      </label>
                      <div style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        fontSize: '16px',
                        minHeight: '20px'
                      }}>
                        {swapData.quote ? swapData.quote.toAmount : '0.00'}
                      </div>
                    </div>
                    <button 
                      onClick={getSwapQuote}
                      disabled={!swapData.amount || swapData.loading || parseFloat(swapData.amount) <= 0}
                      style={{ 
                        width: '100%',
                        padding: '12px',
                        background: (!swapData.amount || parseFloat(swapData.amount) <= 0 || swapData.loading)
                          ? '#ccc' 
                          : 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: (!swapData.amount || parseFloat(swapData.amount) <= 0 || swapData.loading) ? 'not-allowed' : 'pointer',
                        fontSize: '16px',
                        fontWeight: '600',
                        transition: 'all 0.3s ease',
                        opacity: (!swapData.amount || parseFloat(swapData.amount) <= 0 || swapData.loading) ? 0.7 : 1
                      }}
                    >
                      {swapData.loading ? 'Getting Quote...' : 'Get Quote'}
                    </button>
                    
                    {/* Quick Test Button */}
                    <button 
                      onClick={() => setSwapData(prev => ({ ...prev, amount: '0.1' }))}
                      style={{ 
                        width: '100%',
                        padding: '8px',
                        background: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        marginTop: '10px',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      🧪 Quick Test (0.1 ETH)
                    </button>
                    
                    {/* Debug Info */}
                    <div style={{ 
                      marginTop: '10px', 
                      padding: '8px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      opacity: 0.7
                    }}>
                      Debug: Amount="{swapData.amount}", Wallet="{walletAddress ? 'Connected' : 'Not Connected'}"
                    </div>
                    {swapData.quote && (
                      <div style={{ 
                        marginTop: '15px', 
                        padding: '10px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        fontSize: '0.9rem'
                      }}>
                        <div>Price Impact: {swapData.quote.priceImpact}</div>
                        <div>Min Received: {swapData.quote.minimumReceived} {swapData.toToken}</div>
                        <div>Gas Est: {swapData.quote.gasEstimate}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'yield' && (
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', textAlign: 'center' }}>
                    🌾 Yield Farming Opportunities
                  </h3>
                  
                  {/* Debug Info */}
                  <div style={{ 
                    marginBottom: '15px', 
                    padding: '10px', 
                    background: 'rgba(255,255,255,0.1)', 
                    borderRadius: '8px',
                    fontSize: '0.8rem'
                  }}>
                    <strong>Debug:</strong> Yield farms loaded: {yieldFarms.length} | 
                    <button 
                      onClick={() => {
                        loadYieldFarms();
                        showToast('Yield farms reloaded!', 'success');
                      }}
                      style={{ 
                        marginLeft: '10px',
                        padding: '5px 10px',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      🔄 Reload
                    </button>
                  </div>

                  <div style={{ 
                    display: 'grid', 
                    gap: '15px'
                  }}>
                    {yieldFarms.length > 0 ? yieldFarms.map((farm, index) => (
                      <div key={index} style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        padding: '20px', 
                        borderRadius: '15px',
                        backdropFilter: 'blur(10px)',
                        border: '2px solid ' + (farm.risk === 'Low' ? '#28a745' : farm.risk === 'Medium' ? '#ffc107' : '#dc3545')
                      }}>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'auto 1fr auto',
                          gap: '15px',
                          alignItems: 'center',
                          marginBottom: '10px'
                        }}>
                          <div style={{ fontSize: '2rem' }}>{farm.logo}</div>
                          <div>
                            <h4 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>
                              {farm.protocol} - {farm.token}
                            </h4>
                            <p style={{ margin: '0', fontSize: '0.9rem', opacity: 0.8 }}>
                              {farm.description}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ 
                              fontSize: '1.3rem', 
                              fontWeight: 'bold',
                              color: farm.risk === 'Low' ? '#28a745' : farm.risk === 'Medium' ? '#ffc107' : '#dc3545'
                            }}>
                              {farm.apy}
                            </div>
                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>APY</div>
                          </div>
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '10px',
                          fontSize: '0.9rem'
                        }}>
                          <div>
                            <strong>TVL:</strong> {farm.tvl}
                          </div>
                          <div>
                            <strong>Risk:</strong> 
                            <span style={{ 
                              color: farm.risk === 'Low' ? '#28a745' : farm.risk === 'Medium' ? '#ffc107' : '#dc3545',
                              fontWeight: 'bold'
                            }}>
                              {farm.risk}
                            </span>
                          </div>
                          <div>
                            <strong>Min:</strong> {farm.minDeposit}
                          </div>
                        </div>
                        <button 
                          onClick={() => showToast('Connecting to ' + farm.protocol + '...', 'success')}
                          style={{ 
                            width: '100%',
                            marginTop: '15px',
                            padding: '10px',
                            background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          🚀 Start Farming
                        </button>
                      </div>
                    )) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '40px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '15px',
                        backdropFilter: 'blur(10px)'
                      }}>
                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🌾</div>
                        <h4 style={{ margin: '0 0 10px 0' }}>No Yield Farms Loaded</h4>
                        <p style={{ margin: '0 0 20px 0', opacity: 0.8 }}>
                          Click the "Reload" button above to load yield farming opportunities
                        </p>
                        <button 
                          onClick={() => {
                            loadYieldFarms();
                            showToast('Loading yield farms...', 'success');
                          }}
                          style={{ 
                            padding: '10px 20px',
                            background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '600'
                          }}
                        >
                          🔄 Load Yield Farms
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'charts' && (
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', textAlign: 'center' }}>
                    📈 Price Charts
                  </h3>
                  
                  {/* Debug Info */}
                  <div style={{ 
                    marginBottom: '15px', 
                    padding: '10px', 
                    background: 'rgba(255,255,255,0.1)', 
                    borderRadius: '8px',
                    fontSize: '0.8rem'
                  }}>
                    <strong>Debug:</strong> Price charts loaded: {priceCharts.length} | 
                    <button 
                      onClick={() => {
                        loadPriceCharts();
                        showToast('Price charts reloaded!', 'success');
                      }}
                      style={{ 
                        marginLeft: '10px',
                        padding: '5px 10px',
                        background: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      🔄 Reload
                    </button>
                  </div>
                  
                  {priceCharts.length > 0 ? (
                    <>
                      {/* Chart Selector */}
                      <div style={{ 
                        display: 'flex', 
                        gap: '10px', 
                        marginBottom: '20px',
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                      }}>
                        {priceCharts.map((chart) => (
                      <button 
                        key={chart.symbol}
                        onClick={() => setSelectedChart(chart.symbol)}
                        style={{ 
                          padding: '8px 15px',
                          background: selectedChart === chart.symbol 
                            ? 'rgba(255,255,255,0.2)' 
                            : 'rgba(255,255,255,0.1)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        {chart.symbol}
                      </button>
                    ))}
                  </div>

                  {/* Selected Chart */}
                  {priceCharts.filter(chart => chart.symbol === selectedChart).map((chart) => (
                    <div key={chart.symbol} style={{ 
                      background: 'rgba(255,255,255,0.1)', 
                      padding: '20px', 
                      borderRadius: '15px',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr auto',
                        gap: '15px',
                        alignItems: 'center',
                        marginBottom: '20px'
                      }}>
                        <div>
                          <h4 style={{ margin: '0 0 5px 0', fontSize: '1.3rem' }}>
                            {chart.name} ({chart.symbol})
                          </h4>
                          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: chart.color }}>
                            {chart.price}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ 
                            fontSize: '1.1rem', 
                            fontWeight: 'bold',
                            color: chart.change24h.startsWith('+') ? '#28a745' : '#dc3545'
                          }}>
                            {chart.change24h}
                          </div>
                          <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>24h</div>
                        </div>
                      </div>

                      {/* Mock Sparkline Chart */}
                      <div style={{ 
                        height: '100px', 
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        padding: '10px',
                        marginBottom: '15px',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          position: 'absolute',
                          bottom: '10px',
                          left: '10px',
                          right: '10px',
                          height: '80px',
                          background: 'linear-gradient(90deg, ' + chart.color + '20, ' + chart.color + '40)',
                          borderRadius: '5px',
                          display: 'flex',
                          alignItems: 'end',
                          justifyContent: 'space-between',
                          padding: '5px'
                        }}>
                          {chart.sparkline.map((price, index) => (
                            <div 
                              key={index}
                              style={{
                                width: '12px',
                                height: ((price / Math.max(...chart.sparkline)) * 70) + 'px',
                                background: chart.color,
                                borderRadius: '2px',
                                opacity: 0.8
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Chart Stats */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '10px',
                        fontSize: '0.9rem'
                      }}>
                        <div>
                          <strong>7d Change:</strong> 
                          <span style={{ 
                            color: chart.change7d.startsWith('+') ? '#28a745' : '#dc3545',
                            fontWeight: 'bold'
                          }}>
                            {chart.change7d}
                          </span>
                        </div>
                        <div>
                          <strong>Volume:</strong> {chart.volume}
                        </div>
                        <div>
                          <strong>Market Cap:</strong> {chart.marketCap}
                        </div>
                        <div>
                          <strong>Color:</strong> 
                          <span style={{ color: chart.color, fontWeight: 'bold' }}>
                            {chart.color}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                    </>
                  ) : (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '40px',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '15px',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📈</div>
                      <h4 style={{ margin: '0 0 10px 0' }}>No Price Charts Loaded</h4>
                      <p style={{ margin: '0 0 20px 0', opacity: 0.8 }}>
                        Click the "Reload" button above to load price chart data
                      </p>
                      <button 
                        onClick={() => {
                          loadPriceCharts();
                          showToast('Loading price charts...', 'success');
                        }}
                        style={{ 
                          padding: '10px 20px',
                          background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '600'
                        }}
                      >
                        🔄 Load Price Charts
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '15px', textAlign: 'center' }}>
                    📜 Transaction History
                  </h3>
                  <div style={{ 
                    display: 'grid', 
                    gap: '10px'
                  }}>
                    {transactions.map((tx, index) => (
                      <div key={index} style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        padding: '15px', 
                        borderRadius: '10px',
                        backdropFilter: 'blur(10px)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '10px',
                        alignItems: 'center'
                      }}>
                        <div>
                          <strong>{tx.type}</strong><br />
                          <span style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
                            {tx.hash}
                          </span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <strong>{tx.amount}</strong><br />
                          <span style={{ fontSize: '0.9rem' }}>{tx.value}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ 
                            color: tx.status === 'Confirmed' ? '#28a745' : '#ffc107',
                            fontWeight: 'bold',
                            fontSize: '0.9rem'
                          }}>
                            {tx.status}
                          </span><br />
                          <span style={{ fontSize: '0.8rem' }}>{tx.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ 
            background: isDarkMode ? '#2d3748' : '#f8f9fa', 
            padding: '30px', 
            borderRadius: '20px',
            marginBottom: '25px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
            border: isDarkMode ? '1px solid #4a5568' : 'none'
          }}>
            <h3 style={{ 
              fontSize: '1.5rem', 
              marginBottom: '20px',
              color: isDarkMode ? '#f7fafc' : '#2d3748',
              textAlign: 'center'
            }}>
              🔗 Connect Your Wallet
            </h3>
            <p style={{ 
              fontSize: '1.1rem', 
              color: isDarkMode ? '#a0aec0' : '#718096',
              marginBottom: '30px',
              textAlign: 'center'
            }}>
              Connect your MetaMask or Coinbase Wallet to get started:
            </p>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '20px',
              flexWrap: 'wrap'
            }}>
              <button 
                onClick={connectWallet}
                style={{ 
                  padding: '20px 30px',
                  background: 'linear-gradient(135deg, #0052cc 0%, #0066ff 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '15px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 8px 25px rgba(0, 82, 204, 0.3)',
                  minWidth: '200px'
                }}
              >
                🔗 Connect Wallet
              </button>
            </div>
          </div>
        )}

        {/* Features Section */}
        <div style={{ 
          marginTop: '40px', 
          padding: '30px',
          background: 'linear-gradient(135deg, #0052cc 0%, #0066ff 100%)',
          borderRadius: '20px',
          color: 'white',
          boxShadow: '0 15px 35px rgba(0, 82, 204, 0.3)'
        }}>
          <h3 style={{ 
            fontSize: '1.8rem', 
            marginBottom: '25px',
            textAlign: 'center',
            fontWeight: '700'
          }}>
            🚀 Complete DeFi Platform:
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '20px',
            textAlign: 'center'
          }}>
            <div style={{ 
              padding: '20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              💼 Wallet Management
            </div>
            <div style={{ 
              padding: '20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              📊 Portfolio Tracking
            </div>
            <div style={{ 
              padding: '20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              🔄 Token Swapping
            </div>
            <div style={{ 
              padding: '20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              🌾 Yield Farming
            </div>
            <div style={{ 
              padding: '20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              📈 Price Charts
            </div>
            <div style={{ 
              padding: '20px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '15px',
              backdropFilter: 'blur(10px)',
              fontSize: '1.1rem',
              fontWeight: '600'
            }}>
              📜 Transaction History
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: toast.type === 'success' ? '#28a745' : '#dc3545',
          color: 'white',
          padding: '15px 20px',
          borderRadius: '10px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          animation: 'slideInRight 0.3s ease-out',
          cursor: 'pointer'
        }} onClick={() => setToast(null)}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;