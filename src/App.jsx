import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

function App() {
  const [wallets, setWallets] = useState([]);
  const [newWalletName, setNewWalletName] = useState('');
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetAmount, setNewAssetAmount] = useState('');
  const [selectedWalletIndex, setSelectedWalletIndex] = useState(null);
  const [assetPrices, setAssetPrices] = useState({});
  const [isLoading, setIsLoading] = useState({});

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedData = localStorage.getItem('cryptoAssetData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setWallets(parsedData.wallets || []);
        setAssetPrices(parsedData.assetPrices || {});
      } catch (error) {
        console.error('Error loading saved data:', error);
      }
    }
  }, []);

  // Save data to localStorage whenever wallets or assetPrices change
  useEffect(() => {
    localStorage.setItem('cryptoAssetData', JSON.stringify({
      wallets,
      assetPrices
    }));
  }, [wallets, assetPrices]);

  const addWallet = () => {
    if (newWalletName.trim()) {
      setWallets([...wallets, { name: newWalletName, assets: [] }]);
      setNewWalletName('');
    }
  };

  const deleteWallet = (index) => {
    const updatedWallets = [...wallets];
    updatedWallets.splice(index, 1);
    setWallets(updatedWallets);
    if (selectedWalletIndex === index) {
      setSelectedWalletIndex(null);
    }
  };

  const addAsset = () => {
    if (selectedWalletIndex !== null && newAssetName.trim() && newAssetAmount.trim()) {
      const amount = parseFloat(newAssetAmount);
      if (!isNaN(amount) && amount > 0) {
        const updatedWallets = [...wallets];
        updatedWallets[selectedWalletIndex].assets.push({
          name: newAssetName.trim(),
          amount
        });
        setWallets(updatedWallets);
        setNewAssetName('');
        setNewAssetAmount('');
      }
    }
  };

  const deleteAsset = (walletIndex, assetIndex) => {
    const updatedWallets = [...wallets];
    updatedWallets[walletIndex].assets.splice(assetIndex, 1);
    setWallets(updatedWallets);
  };

  const fetchAssetPrice = async (assetName) => {
    setIsLoading(prev => ({ ...prev, [assetName]: true }));
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${assetName.toLowerCase()}&vs_currencies=usd`
      );
      
      if (response.data && response.data[assetName.toLowerCase()]) {
        const price = response.data[assetName.toLowerCase()].usd;
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
          summary[asset.name] += asset.amount;
        } else {
          summary[asset.name] = asset.amount;
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

  // Open instructions
  const openInstructions = () => {
    window.open('https://drive.google.com/file/d/1wd6EG5qyT158pELC-uoewVvaqkFE0U14/view?usp=sharing', '_blank');
  };

  return (
    <div className="container">
      <header>
        <h1>Crypto Asset Tracker</h1>
        <button className="btn-black" onClick={openInstructions}>Instructions</button>
      </header>

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
    </div>
  );
}

export default App;
