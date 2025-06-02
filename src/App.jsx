import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

function App() {
  const [wallets, setWallets] = useState([]);
  const [newWalletName, setNewWalletName] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetAmount, setNewAssetAmount] = useState('');
  const [selectedWalletIndex, setSelectedWalletIndex] = useState(null);
  const [assetPrices, setAssetPrices] = useState({});
  const [isLoading, setIsLoading] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for user session on component mount
  useEffect(() => {
    const getSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (data.session) {
        setUser(data.session.user);
      }
      setLoading(false);
    };

    getSession();

    // Set up auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  // Load data from Supabase when user is authenticated
  useEffect(() => {
    if (user) {
      fetchWallets();
      fetchAssetPrices();
    }
  }, [user]);

  // Fetch wallets and their assets from Supabase
  const fetchWallets = async () => {
    if (!user) return;

    try {
      // Fetch wallets
      const { data: walletsData, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id);

      if (walletsError) throw walletsError;

      // For each wallet, fetch its assets
      const walletsWithAssets = await Promise.all(
        walletsData.map(async (wallet) => {
          const { data: assetsData, error: assetsError } = await supabase
            .from('assets')
            .select('*')
            .eq('wallet_id', wallet.id);

          if (assetsError) throw assetsError;

          return {
            ...wallet,
            assets: assetsData || []
          };
        })
      );

      setWallets(walletsWithAssets);
    } catch (error) {
      console.error('Error fetching wallets:', error);
      alert('Error fetching your wallets. Please try again.');
    }
  };

  // Fetch asset prices from Supabase
  const fetchAssetPrices = async () => {
    try {
      const { data, error } = await supabase
        .from('asset_prices')
        .select('*');

      if (error) throw error;

      const pricesObj = {};
      data.forEach(item => {
        pricesObj[item.asset_name] = item.price_usd;
      });

      setAssetPrices(pricesObj);
    } catch (error) {
      console.error('Error fetching asset prices:', error);
    }
  };

  const addWallet = async () => {
    if (!user) {
      alert('Please sign in to add a wallet');
      return;
    }

    if (newWalletName.trim()) {
      try {
        const { data, error } = await supabase
          .from('wallets')
          .insert([{ name: newWalletName, user_id: user.id }])
          .select();

        if (error) throw error;

        if (data && data.length > 0) {
          setWallets([...wallets, { ...data[0], assets: [] }]);
          setNewWalletName('');
        }
      } catch (error) {
        console.error('Error adding wallet:', error);
        alert('Error adding wallet. Please try again.');
      }
    }
  };

  const deleteWallet = async (index) => {
    const walletToDelete = wallets[index];
    
    try {
      // First delete all assets associated with this wallet
      const { error: assetsError } = await supabase
        .from('assets')
        .delete()
        .eq('wallet_id', walletToDelete.id);

      if (assetsError) throw assetsError;

      // Then delete the wallet
      const { error: walletError } = await supabase
        .from('wallets')
        .delete()
        .eq('id', walletToDelete.id);

      if (walletError) throw walletError;

      // Update local state
      const updatedWallets = [...wallets];
      updatedWallets.splice(index, 1);
      setWallets(updatedWallets);
      
      if (selectedWalletIndex === index) {
        setSelectedWalletIndex(null);
      }
    } catch (error) {
      console.error('Error deleting wallet:', error);
      alert('Error deleting wallet. Please try again.');
    }
  };

  const addAsset = async () => {
    if (!user) {
      alert('Please sign in to add an asset');
      return;
    }

    if (selectedWalletIndex !== null && newAssetName.trim() && newAssetAmount.trim()) {
      const amount = parseFloat(newAssetAmount);
      if (!isNaN(amount) && amount > 0) {
        const selectedWallet = wallets[selectedWalletIndex];
        
        try {
          const { data, error } = await supabase
            .from('assets')
            .insert([{
              wallet_id: selectedWallet.id,
              name: newAssetName.trim(),
              amount
            }])
            .select();

          if (error) throw error;

          if (data && data.length > 0) {
            const updatedWallets = [...wallets];
            updatedWallets[selectedWalletIndex].assets.push(data[0]);
            setWallets(updatedWallets);
            setNewAssetName('');
            setNewAssetAmount('');
          }
        } catch (error) {
          console.error('Error adding asset:', error);
          alert('Error adding asset. Please try again.');
        }
      }
    }
  };

  const deleteAsset = async (walletIndex, assetIndex) => {
    const assetToDelete = wallets[walletIndex].assets[assetIndex];
    
    try {
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', assetToDelete.id);

      if (error) throw error;

      const updatedWallets = [...wallets];
      updatedWallets[walletIndex].assets.splice(assetIndex, 1);
      setWallets(updatedWallets);
    } catch (error) {
      console.error('Error deleting asset:', error);
      alert('Error deleting asset. Please try again.');
    }
  };

  const fetchAssetPrice = async (assetName) => {
    setIsLoading(prev => ({ ...prev, [assetName]: true }));
    try {
      // First try to get price from CoinGecko
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${assetName.toLowerCase()}&vs_currencies=usd`
      );
      
      if (response.data && response.data[assetName.toLowerCase()]) {
        const price = response.data[assetName.toLowerCase()].usd;
        
        // Update price in Supabase
        const { error } = await supabase
          .from('asset_prices')
          .upsert({ 
            asset_name: assetName,
            price_usd: price,
            updated_at: new Date()
          }, { 
            onConflict: 'asset_name' 
          });

        if (error) throw error;
        
        // Update local state
        setAssetPrices(prev => ({
          ...prev,
          [assetName]: price
        }));
      } else {
        alert(`Price not found for ${assetName}. Make sure to use the correct CoinGecko ID.`);
      }
    } catch (error) {
      console.error('Error fetching price:', error);
      alert(`Error fetching price for ${assetName}. ${error.message}`);
    } finally {
      setIsLoading(prev => ({ ...prev, [assetName]: false }));
    }
  };

  // Calculate portfolio summary
  const calculatePortfolioSummary = () => {
    const summary = {};
    
    wallets.forEach(wallet => {
      wallet.assets.forEach(asset => {
        if (summary[asset.name]) {
          summary[asset.name] += parseFloat(asset.amount);
        } else {
          summary[asset.name] = parseFloat(asset.amount);
        }
      });
    });
    
    return Object.entries(summary).map(([name, amount]) => ({
      name,
      amount,
      price: assetPrices[name] || null,
      value: assetPrices[name] ? assetPrices[name] * amount : null
    }));
  };

  const portfolioSummary = calculatePortfolioSummary();
  
  // Calculate total value
  const totalValue = portfolioSummary.reduce((sum, asset) => {
    return sum + (asset.value || 0);
  }, 0);

  // Export to Excel
  const exportToExcel = () => {
    // Create worksheet for portfolio summary
    const summaryData = [
      ['Asset', 'Total Amount', 'Live Price (USD)', 'Value (USD)'],
      ...portfolioSummary.map(asset => [
        asset.name,
        asset.amount,
        asset.price || 'Not fetched',
        asset.value || 'N/A'
      ]),
      ['Total', '', '', totalValue]
    ];
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    
    // Create worksheet for detailed wallet data
    const detailedData = [['Wallet/Exchange', 'Asset', 'Amount']];
    wallets.forEach(wallet => {
      wallet.assets.forEach(asset => {
        detailedData.push([wallet.name, asset.name, asset.amount]);
      });
    });
    
    const detailedWs = XLSX.utils.aoa_to_sheet(detailedData);
    
    // Create workbook and add worksheets
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Portfolio Summary');
    XLSX.utils.book_append_sheet(wb, detailedWs, 'Detailed Holdings');
    
    // Generate Excel file and trigger download
    XLSX.writeFile(wb, 'crypto-portfolio.xlsx');
  };

  // Authentication functions
  const handleSignUp = async (email, password) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      alert('Check your email for the confirmation link!');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleSignIn = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (error) {
      alert(error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setWallets([]);
    } catch (error) {
      alert(error.message);
    }
  };

  // Open instructions
  const openInstructions = () => {
    window.open('https://drive.google.com/file/d/1wd6EG5qyT158pELC-uoewVvaqkFE0U14/view?usp=sharing', '_blank');
  };

  // Auth component
  const AuthComponent = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);

    return (
      <div className="auth-container">
        <h2>{isSignUp ? 'Sign Up' : 'Sign In'}</h2>
        <div className="form-group">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="auth-buttons">
          <button 
            className="btn-primary" 
            onClick={() => isSignUp ? handleSignUp(email, password) : handleSignIn(email, password)}
          >
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button 
            className="btn-secondary" 
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="container">
      <header>
        <h1>Crypto Asset Tracker</h1>
        <div className="header-buttons">
          <button className="btn-black" onClick={openInstructions}>Instructions</button>
          {user ? (
            <button className="btn-danger" onClick={handleSignOut}>Sign Out</button>
          ) : null}
        </div>
      </header>

      {!user ? (
        <AuthComponent />
      ) : (
        <>
          <div className="section">
            <h2>Add Wallet or Exchange</h2>
            <div className="form-row">
              <input
                type="text"
                placeholder="Wallet or Exchange Name"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
              />
              <button className="btn-primary" onClick={addWallet}>Add</button>
            </div>
          </div>

          {wallets.length > 0 && (
            <div className="section">
              <h2>Add Crypto Assets</h2>
              <div className="form-group">
                <label>Select Wallet/Exchange: </label>
                <select 
                  value={selectedWalletIndex !== null ? selectedWalletIndex : ''}
                  onChange={(e) => setSelectedWalletIndex(e.target.value !== '' ? parseInt(e.target.value) : null)}
                >
                  <option value="">-- Select --</option>
                  {wallets.map((wallet, index) => (
                    <option key={index} value={index}>{wallet.name}</option>
                  ))}
                </select>
              </div>

              {selectedWalletIndex !== null && (
                <div className="form-group">
                  <div className="form-row">
                    <input
                      type="text"
                      placeholder="Asset Name (e.g., bitcoin, ethereum)"
                      value={newAssetName}
                      onChange={(e) => setNewAssetName(e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={newAssetAmount}
                      onChange={(e) => setNewAssetAmount(e.target.value)}
                      min="0"
                      step="any"
                    />
                    <button className="btn-primary" onClick={addAsset}>Add Asset</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {wallets.length > 0 && (
            <div className="section">
              <h2>Your Wallets & Exchanges</h2>
              {wallets.map((wallet, walletIndex) => (
                <div key={walletIndex} className="wallet-card">
                  <div className="wallet-header">
                    <div className="wallet-name">{wallet.name}</div>
                    <button className="btn-danger" onClick={() => deleteWallet(walletIndex)}>Delete</button>
                  </div>
                  
                  {wallet.assets.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Amount</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wallet.assets.map((asset, assetIndex) => (
                          <tr key={assetIndex}>
                            <td>{asset.name}</td>
                            <td>{asset.amount}</td>
                            <td>
                              <button 
                                className="btn-danger" 
                                onClick={() => deleteAsset(walletIndex, assetIndex)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No assets added yet.</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {portfolioSummary.length > 0 && (
            <div className="section">
              <h2>Portfolio Summary</h2>
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Total Amount</th>
                    <th>Asset Live Price (USD)</th>
                    <th>Live Value of Assets (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolioSummary.map((asset, index) => (
                    <tr key={index}>
                      <td>{asset.name}</td>
                      <td>{asset.amount}</td>
                      <td>
                        {asset.price ? `$${asset.price.toFixed(2)}` : 'Not fetched'} 
                        <button 
                          className="btn-info" 
                          onClick={() => fetchAssetPrice(asset.name)}
                          disabled={isLoading[asset.name]}
                        >
                          {isLoading[asset.name] ? 'Loading...' : 'Fetch Price'}
                        </button>
                      </td>
                      <td>{asset.value ? `$${asset.value.toFixed(2)}` : 'N/A'}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}>Total Value</td>
                    <td>${totalValue.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="actions">
            <button className="btn-warning" onClick={exportToExcel}>Export to Spreadsheet</button>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
