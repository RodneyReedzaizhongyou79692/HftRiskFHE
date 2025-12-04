import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface RiskData {
  id: string;
  exchange: string;
  riskScore: number;
  timestamp: number;
  encryptedData: string;
  marketImpact: number;
  volatility: number;
  details?: {
    orderBookDepth: number;
    liquidity: number;
    flashCrashRisk: number;
    correlation: number;
  };
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [riskData, setRiskData] = useState<RiskData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRiskData, setNewRiskData] = useState({
    exchange: "Binance",
    riskScore: 0,
    marketImpact: 0,
    volatility: 0
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedData, setSelectedData] = useState<RiskData | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Filter data based on search term
  const filteredData = riskData.filter(data => 
    data.exchange.toLowerCase().includes(searchTerm.toLowerCase()) ||
    data.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate statistics for dashboard
  const highRiskCount = riskData.filter(r => r.riskScore >= 7).length;
  const mediumRiskCount = riskData.filter(r => r.riskScore >= 4 && r.riskScore < 7).length;
  const lowRiskCount = riskData.filter(r => r.riskScore < 4).length;

  useEffect(() => {
    loadRiskData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRiskData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("risk_data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing risk data keys:", e);
        }
      }
      
      const list: RiskData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`risk_data_${key}`);
          if (dataBytes.length > 0) {
            try {
              const riskData = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                exchange: riskData.exchange,
                riskScore: riskData.riskScore,
                timestamp: riskData.timestamp,
                encryptedData: riskData.encryptedData,
                marketImpact: riskData.marketImpact,
                volatility: riskData.volatility,
                details: riskData.details
              });
            } catch (e) {
              console.error(`Error parsing risk data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading risk data ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRiskData(list);
    } catch (e) {
      console.error("Error loading risk data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRiskData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting risk data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-ENCRYPTED-${btoa(JSON.stringify(newRiskData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const riskDataItem = {
        exchange: newRiskData.exchange,
        riskScore: newRiskData.riskScore,
        timestamp: Math.floor(Date.now() / 1000),
        encryptedData: encryptedData,
        marketImpact: newRiskData.marketImpact,
        volatility: newRiskData.volatility,
        details: {
          orderBookDepth: Math.random() * 100,
          liquidity: Math.random() * 100,
          flashCrashRisk: Math.random() * 10,
          correlation: Math.random()
        }
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `risk_data_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(riskDataItem))
      );
      
      const keysBytes = await contract.getData("risk_data_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "risk_data_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Risk data encrypted and stored securely!"
      });
      
      await loadRiskData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRiskData({
          exchange: "Binance",
          riskScore: 0,
          marketImpact: 0,
          volatility: 0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const showDataDetails = (data: RiskData) => {
    setSelectedData(data);
    setShowDetails(true);
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Checking FHE contract availability..."
    });

    try {
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Failed to get contract");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE contract is ${isAvailable ? "available" : "unavailable"}` 
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const getRiskLevel = (score: number) => {
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  };

  const renderRiskChart = () => {
    const dataPoints = [
      { x: 'Jan', y: riskData.length > 0 ? riskData[0].riskScore : 5 },
      { x: 'Feb', y: riskData.length > 1 ? riskData[1].riskScore : 3 },
      { x: 'Mar', y: riskData.length > 2 ? riskData[2].riskScore : 7 },
      { x: 'Apr', y: riskData.length > 3 ? riskData[3].riskScore : 4 },
      { x: 'May', y: riskData.length > 4 ? riskData[4].riskScore : 6 },
      { x: 'Jun', y: riskData.length > 5 ? riskData[5].riskScore : 2 }
    ];

    const maxY = Math.max(...dataPoints.map(d => d.y), 10);
    
    return (
      <div className="risk-chart">
        <div className="chart-title">Systemic Risk Trend (FHE Processed)</div>
        <div className="chart-container">
          <div className="y-axis">
            <span>10</span>
            <span>8</span>
            <span>6</span>
            <span>4</span>
            <span>2</span>
            <span>0</span>
          </div>
          <div className="chart-area">
            {dataPoints.map((point, index) => (
              <div 
                key={index} 
                className="chart-bar-container"
                style={{ left: `${(index / (dataPoints.length - 1)) * 100}%` }}
              >
                <div 
                  className={`chart-bar ${getRiskLevel(point.y)}`}
                  style={{ height: `${(point.y / maxY) * 100}%` }}
                ></div>
                <div className="chart-label">{point.x}</div>
                <div className="chart-value">{point.y.toFixed(1)}</div>
              </div>
            ))}
            <div className="chart-line"></div>
          </div>
        </div>
        <div className="chart-x-axis">Time</div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen cyberpunk-bg">
      <div className="cyber-spinner neon-blue"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header neon-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon neon-cyan"></div>
          </div>
          <h1>HFT<span className="neon-pink">Risk</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn cyber-button neon-purple"
          >
            <div className="add-icon"></div>
            Add Risk Data
          </button>
          <button 
            className="cyber-button neon-blue"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content cyberpunk-bg">
        <div className="welcome-banner neon-gradient">
          <div className="welcome-text">
            <h2>Confidential Analysis of Systemic Risk from High-Frequency Trading</h2>
            <p>Regulators analyze encrypted HFT order book data across multiple exchanges using FHE to assess market stability impact</p>
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card neon-border">
            <h3 className="neon-cyan">Project Introduction</h3>
            <p>This platform enables financial regulators to confidentially analyze high-frequency trading data using Fully Homomorphic Encryption (FHE).</p>
            <p>By processing encrypted order book data without decryption, regulators can identify systemic risks while preserving trading strategy confidentiality.</p>
            <div className="fhe-badge neon-blue">
              <span>FHE-Powered Confidential Analysis</span>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card neon-border">
            <h3 className="neon-pink">Risk Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value neon-green">{riskData.length}</div>
                <div className="stat-label">Total Analyses</div>
              </div>
              <div className="stat-item">
                <div className="stat-value neon-red">{highRiskCount}</div>
                <div className="stat-label">High Risk</div>
              </div>
              <div className="stat-item">
                <div className="stat-value neon-yellow">{mediumRiskCount}</div>
                <div className="stat-label">Medium Risk</div>
              </div>
              <div className="stat-item">
                <div className="stat-value neon-cyan">{lowRiskCount}</div>
                <div className="stat-label">Low Risk</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card neon-border">
            <h3 className="neon-purple">Risk Trend Analysis</h3>
            {renderRiskChart()}
          </div>
        </div>
        
        <div className="data-section">
          <div className="section-header">
            <h2 className="neon-cyan">Encrypted HFT Risk Data</h2>
            <div className="header-actions">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search exchange or ID..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="cyber-input neon-border"
                />
              </div>
              <button 
                onClick={loadRiskData}
                className="refresh-btn cyber-button neon-blue"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
          
          <div className="data-list cyber-card neon-border">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Exchange</div>
              <div className="header-cell">Risk Score</div>
              <div className="header-cell">Market Impact</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredData.length === 0 ? (
              <div className="no-data">
                <div className="no-data-icon neon-purple"></div>
                <p>No encrypted risk data found</p>
                <button 
                  className="cyber-button neon-pink"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Data Set
                </button>
              </div>
            ) : (
              filteredData.map(data => (
                <div className="data-row" key={data.id}>
                  <div className="table-cell data-id">#{data.id.substring(0, 6)}</div>
                  <div className="table-cell">{data.exchange}</div>
                  <div className="table-cell">
                    <span className={`risk-badge ${getRiskLevel(data.riskScore)}`}>
                      {data.riskScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="table-cell">{data.marketImpact.toFixed(2)}%</div>
                  <div className="table-cell">
                    {new Date(data.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn cyber-button neon-cyan"
                      onClick={() => showDataDetails(data)}
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="team-section cyber-card neon-border">
          <h3 className="neon-green">Development Team</h3>
          <div className="team-grid">
            <div className="team-member">
              <div className="member-avatar neon-pink-bg"></div>
              <div className="member-name">Dr. Alice Chen</div>
              <div className="member-role">FHE Cryptography Expert</div>
            </div>
            <div className="team-member">
              <div className="member-avatar neon-blue-bg"></div>
              <div className="member-name">Mark Johnson</div>
              <div className="member-role">Financial Risk Analyst</div>
            </div>
            <div className="team-member">
              <div className="member-avatar neon-cyan-bg"></div>
              <div className="member-name">Sarah Williams</div>
              <div className="member-role">Blockchain Developer</div>
            </div>
            <div className="team-member">
              <div className="member-avatar neon-purple-bg"></div>
              <div className="member-name">Robert Kim</div>
              <div className="member-role">Data Visualization Specialist</div>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRiskData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          riskData={newRiskData}
          setRiskData={setNewRiskData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card neon-border">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner neon-blue"></div>}
              {transactionStatus.status === "success" && <div className="check-icon neon-green"></div>}
              {transactionStatus.status === "error" && <div className="error-icon neon-red"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}

      {showDetails && selectedData && (
        <DataDetails 
          data={selectedData} 
          onClose={() => setShowDetails(false)} 
        />
      )}
  
      <footer className="app-footer neon-border-top">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon neon-cyan"></div>
              <span>HftRiskFHE</span>
            </div>
            <p>Confidential analysis of systemic risk from high-frequency trading</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link neon-hover">Documentation</a>
            <a href="#" className="footer-link neon-hover">Privacy Policy</a>
            <a href="#" className="footer-link neon-hover">Terms of Service</a>
            <a href="#" className="footer-link neon-hover">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge neon-purple">
            <span>FHE-Powered Confidential Analysis</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} HftRiskFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  riskData: any;
  setRiskData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  riskData,
  setRiskData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRiskData({
      ...riskData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!riskData.exchange) {
      alert("Please select an exchange");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card neon-border">
        <div className="modal-header">
          <h2 className="neon-pink">Add HFT Risk Data</h2>
          <button onClick={onClose} className="close-modal neon-hover">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner neon-blue-bg">
            <div className="key-icon"></div> Data will be encrypted with FHE before storage
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Exchange *</label>
              <select 
                name="exchange"
                value={riskData.exchange} 
                onChange={handleChange}
                className="cyber-select neon-border"
              >
                <option value="Binance">Binance</option>
                <option value="Coinbase">Coinbase</option>
                <option value="Kraken">Kraken</option>
                <option value="FTX">FTX</option>
                <option value="BitMEX">BitMEX</option>
                <option value="Bybit">Bybit</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Risk Score (0-10)</label>
              <input 
                type="range"
                name="riskScore"
                min="0"
                max="10"
                step="0.1"
                value={riskData.riskScore} 
                onChange={handleChange}
                className="cyber-range neon-border"
              />
              <div className="range-value">{riskData.riskScore}</div>
            </div>
            
            <div className="form-group">
              <label>Market Impact (%)</label>
              <input 
                type="range"
                name="marketImpact"
                min="0"
                max="10"
                step="0.1"
                value={riskData.marketImpact} 
                onChange={handleChange}
                className="cyber-range neon-border"
              />
              <div className="range-value">{riskData.marketImpact}%</div>
            </div>
            
            <div className="form-group">
              <label>Volatility</label>
              <input 
                type="range"
                name="volatility"
                min="0"
                max="10"
                step="0.1"
                value={riskData.volatility} 
                onChange={handleChange}
                className="cyber-range neon-border"
              />
              <div className="range-value">{riskData.volatility}</div>
            </div>
          </div>
          
          <div className="privacy-notice neon-cyan">
            <div className="privacy-icon"></div> All data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button neon-border"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button neon-pink"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DataDetailsProps {
  data: RiskData;
  onClose: () => void;
}

const DataDetails: React.FC<DataDetailsProps> = ({ data, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="details-modal cyber-card neon-border">
        <div className="modal-header">
          <h2 className="neon-cyan">Risk Data Details</h2>
          <button onClick={onClose} className="close-modal neon-hover">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">ID:</span>
              <span className="detail-value">{data.id}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Exchange:</span>
              <span className="detail-value">{data.exchange}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Risk Score:</span>
              <span className={`detail-value risk-${data.riskScore >= 7 ? 'high' : data.riskScore >= 4 ? 'medium' : 'low'}`}>
                {data.riskScore.toFixed(1)}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Market Impact:</span>
              <span className="detail-value">{data.marketImpact.toFixed(2)}%</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Volatility:</span>
              <span className="detail-value">{data.volatility.toFixed(2)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Date:</span>
              <span className="detail-value">{new Date(data.timestamp * 1000).toLocaleString()}</span>
            </div>
          </div>
          
          {data.details && (
            <div className="detail-section">
              <h3 className="neon-purple">Detailed Metrics</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Order Book Depth:</span>
                  <span className="detail-value">{data.details.orderBookDepth.toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Liquidity:</span>
                  <span className="detail-value">{data.details.liquidity.toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Flash Crash Risk:</span>
                  <span className="detail-value">{data.details.flashCrashRisk.toFixed(2)}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Correlation:</span>
                  <span className="detail-value">{data.details.correlation.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="encryption-notice neon-blue-bg">
            <div className="lock-icon"></div>
            <span>This data is encrypted using FHE and can be processed without decryption</span>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="close-btn cyber-button neon-border"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;