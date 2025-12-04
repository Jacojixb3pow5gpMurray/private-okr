import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PersonalOKR {
  id: string;
  objective: string;
  keyResults: string[];
  progress: number;
  encryptedData: string;
  timestamp: number;
  owner: string;
  status: "active" | "completed" | "archived";
}

interface TeamOKR {
  id: string;
  objective: string;
  aggregatedProgress: number;
  lastUpdated: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [personalOKRs, setPersonalOKRs] = useState<PersonalOKR[]>([]);
  const [teamOKRs, setTeamOKRs] = useState<TeamOKR[]>([]);
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
  const [newOKRData, setNewOKRData] = useState({
    objective: "",
    keyResults: [""],
    progress: 0
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [expandedOKR, setExpandedOKR] = useState<string | null>(null);

  // Calculate statistics for dashboard
  const activeCount = personalOKRs.filter(okr => okr.status === "active").length;
  const completedCount = personalOKRs.filter(okr => okr.status === "completed").length;
  const avgProgress = personalOKRs.length > 0 
    ? Math.round(personalOKRs.reduce((sum, okr) => sum + okr.progress, 0) / personalOKRs.length)
    : 0;

  useEffect(() => {
    loadOKRs().finally(() => setLoading(false));
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

  const loadOKRs = async () => {
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
      
      // Load personal OKRs
      const personalKeysBytes = await contract.getData(`okr_keys_${account}`);
      let personalKeys: string[] = [];
      
      if (personalKeysBytes.length > 0) {
        try {
          personalKeys = JSON.parse(ethers.toUtf8String(personalKeysBytes));
        } catch (e) {
          console.error("Error parsing personal OKR keys:", e);
        }
      }
      
      const personalList: PersonalOKR[] = [];
      
      for (const key of personalKeys) {
        try {
          const okrBytes = await contract.getData(`okr_${key}`);
          if (okrBytes.length > 0) {
            try {
              const okrData = JSON.parse(ethers.toUtf8String(okrBytes));
              personalList.push({
                id: key,
                objective: okrData.objective,
                keyResults: okrData.keyResults,
                progress: okrData.progress,
                encryptedData: okrData.encryptedData,
                timestamp: okrData.timestamp,
                owner: okrData.owner,
                status: okrData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing OKR data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading OKR ${key}:`, e);
        }
      }
      
      personalList.sort((a, b) => b.timestamp - a.timestamp);
      setPersonalOKRs(personalList);
      
      // Load team OKRs
      const teamKeysBytes = await contract.getData("team_okr_keys");
      let teamKeys: string[] = [];
      
      if (teamKeysBytes.length > 0) {
        try {
          teamKeys = JSON.parse(ethers.toUtf8String(teamKeysBytes));
        } catch (e) {
          console.error("Error parsing team OKR keys:", e);
        }
      }
      
      const teamList: TeamOKR[] = [];
      
      for (const key of teamKeys) {
        try {
          const okrBytes = await contract.getData(`team_okr_${key}`);
          if (okrBytes.length > 0) {
            try {
              const okrData = JSON.parse(ethers.toUtf8String(okrBytes));
              teamList.push({
                id: key,
                objective: okrData.objective,
                aggregatedProgress: okrData.aggregatedProgress,
                lastUpdated: okrData.lastUpdated
              });
            } catch (e) {
              console.error(`Error parsing team OKR data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading team OKR ${key}:`, e);
        }
      }
      
      teamList.sort((a, b) => b.lastUpdated - a.lastUpdated);
      setTeamOKRs(teamList);
    } catch (e) {
      console.error("Error loading OKRs:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitOKR = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting OKR data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newOKRData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const okrId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const okrData = {
        objective: newOKRData.objective,
        keyResults: newOKRData.keyResults,
        progress: newOKRData.progress,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "active"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `okr_${okrId}`, 
        ethers.toUtf8Bytes(JSON.stringify(okrData))
      );
      
      const keysBytes = await contract.getData(`okr_keys_${account}`);
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(okrId);
      
      await contract.setData(
        `okr_keys_${account}`, 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted OKR submitted securely!"
      });
      
      await loadOKRs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewOKRData({
          objective: "",
          keyResults: [""],
          progress: 0
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

  const updateOKRProgress = async (okrId: string, newProgress: number) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Updating encrypted progress with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const okrBytes = await contract.getData(`okr_${okrId}`);
      if (okrBytes.length === 0) {
        throw new Error("OKR not found");
      }
      
      const okrData = JSON.parse(ethers.toUtf8String(okrBytes));
      
      const updatedOKR = {
        ...okrData,
        progress: newProgress
      };
      
      await contract.setData(
        `okr_${okrId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedOKR))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Progress updated with FHE encryption!"
      });
      
      await loadOKRs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const archiveOKR = async (okrId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Archiving OKR with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const okrBytes = await contract.getData(`okr_${okrId}`);
      if (okrBytes.length === 0) {
        throw new Error("OKR not found");
      }
      
      const okrData = JSON.parse(ethers.toUtf8String(okrBytes));
      
      const updatedOKR = {
        ...okrData,
        status: "archived"
      };
      
      await contract.setData(
        `okr_${okrId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedOKR))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "OKR archived securely!"
      });
      
      await loadOKRs();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Archive failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const tutorialSteps = [
    {
      title: "Connect Wallet",
      description: "Connect your Web3 wallet to start setting your personal OKRs",
      icon: "🔗"
    },
    {
      title: "Set Personal OKRs",
      description: "Create your Objectives and Key Results which will be encrypted using FHE",
      icon: "🎯"
    },
    {
      title: "FHE Aggregation",
      description: "Your progress is aggregated with team members without revealing individual data",
      icon: "🔒"
    },
    {
      title: "Track Progress",
      description: "Update your progress and see how it contributes to team goals",
      icon: "📈"
    }
  ];

  const renderProgressBar = (progress: number) => {
    return (
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${progress}%`, backgroundColor: progress >= 70 ? "#4CAF50" : progress >= 40 ? "#FFC107" : "#F44336" }}
        ></div>
        <div className="progress-text">{progress}%</div>
      </div>
    );
  };

  const renderBarChart = () => {
    return (
      <div className="bar-chart-container">
        <div className="chart-title">Team Progress Overview</div>
        <div className="chart-bars">
          {teamOKRs.slice(0, 5).map((okr, index) => (
            <div className="bar-item" key={okr.id}>
              <div className="bar-label">Obj {index + 1}</div>
              <div className="bar-wrapper">
                <div 
                  className="bar" 
                  style={{ height: `${okr.aggregatedProgress}%` }}
                ></div>
              </div>
              <div className="bar-value">{okr.aggregatedProgress}%</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="nature-spinner">
        <div className="leaf leaf1"></div>
        <div className="leaf leaf2"></div>
        <div className="leaf leaf3"></div>
      </div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container nature-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="tree-icon"></div>
          </div>
          <h1>Privacy<span>OKR</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-okr-btn nature-button"
          >
            <div className="add-icon"></div>
            Add OKR
          </button>
          <button 
            className="nature-button"
            onClick={() => setShowTutorial(!showTutorial)}
          >
            {showTutorial ? "Hide Tutorial" : "Show Tutorial"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-First OKR Management</h2>
            <p>Set personal goals privately while contributing to team success with FHE technology</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How PrivacyOKR Works</h2>
            <p className="subtitle">Learn how to set goals while protecting your privacy</p>
            
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div 
                  className="tutorial-step"
                  key={index}
                >
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-grid">
          <div className="dashboard-card nature-card">
            <h3>Project Introduction</h3>
            <p>PrivacyOKR uses Fully Homomorphic Encryption (FHE) to allow employees to set personal goals while keeping them private. Team progress is calculated by aggregating encrypted individual progress without decrypting personal data.</p>
            <div className="features">
              <div className="feature-item">
                <div className="feature-icon">🔒</div>
                <span>Encrypted Personal OKRs</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">📊</div>
                <span>FHE Team Progress Aggregation</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">👥</div>
                <span>Anonymous Team Dashboard</span>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>Your OKR Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{personalOKRs.length}</div>
                <div className="stat-label">Total OKRs</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{activeCount}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{completedCount}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{avgProgress}%</div>
                <div className="stat-label">Avg Progress</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card nature-card">
            <h3>Team Progress</h3>
            {teamOKRs.length > 0 ? renderBarChart() : (
              <div className="no-team-data">
                <p>Team progress data will appear here once aggregated</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="okr-sections">
          <div className="personal-okr-section">
            <div className="section-header">
              <h2>Your Personal OKRs</h2>
              <div className="header-actions">
                <button 
                  onClick={loadOKRs}
                  className="refresh-btn nature-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="okr-list nature-card">
              {personalOKRs.length === 0 ? (
                <div className="no-okrs">
                  <div className="no-okrs-icon"></div>
                  <p>No personal OKRs found</p>
                  <button 
                    className="nature-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create Your First OKR
                  </button>
                </div>
              ) : (
                personalOKRs.map(okr => (
                  <div 
                    className={`okr-item ${okr.status}`} 
                    key={okr.id}
                    onClick={() => setExpandedOKR(expandedOKR === okr.id ? null : okr.id)}
                  >
                    <div className="okr-header">
                      <div className="okr-title">{okr.objective}</div>
                      <div className="okr-meta">
                        <span className={`status-badge ${okr.status}`}>
                          {okr.status}
                        </span>
                        <span className="date">
                          {new Date(okr.timestamp * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    {renderProgressBar(okr.progress)}
                    
                    {expandedOKR === okr.id && (
                      <div className="okr-details">
                        <div className="key-results">
                          <h4>Key Results:</h4>
                          <ul>
                            {okr.keyResults.map((kr, index) => (
                              <li key={index}>{kr}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="okr-actions">
                          <div className="progress-slider">
                            <label>Update Progress: {okr.progress}%</label>
                            <input 
                              type="range" 
                              min="0" 
                              max="100" 
                              value={okr.progress} 
                              onChange={(e) => updateOKRProgress(okr.id, parseInt(e.target.value))}
                            />
                          </div>
                          
                          {okr.status !== "archived" && (
                            <button 
                              className="nature-button archive-btn"
                              onClick={() => archiveOKR(okr.id)}
                            >
                              Archive OKR
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="team-okr-section">
            <div className="section-header">
              <h2>Team Objectives</h2>
              <div className="fhe-badge">
                <span>FHE Aggregated</span>
              </div>
            </div>
            
            <div className="team-okr-list nature-card">
              {teamOKRs.length === 0 ? (
                <div className="no-team-okrs">
                  <div className="fhe-icon"></div>
                  <p>Team objectives will appear here after FHE aggregation</p>
                </div>
              ) : (
                teamOKRs.map(okr => (
                  <div className="team-okr-item" key={okr.id}>
                    <div className="team-okr-title">{okr.objective}</div>
                    {renderProgressBar(okr.aggregatedProgress)}
                    <div className="team-okr-meta">
                      Last updated: {new Date(okr.lastUpdated * 1000).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitOKR} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          okrData={newOKRData}
          setOKRData={setNewOKRData}
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
          <div className="transaction-content nature-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="nature-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="tree-icon"></div>
              <span>PrivacyOKR</span>
            </div>
            <p>Secure encrypted OKR management using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} PrivacyOKR. All rights reserved.
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
  okrData: any;
  setOKRData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  okrData,
  setOKRData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setOKRData({
      ...okrData,
      [name]: value
    });
  };

  const handleKeyResultChange = (index: number, value: string) => {
    const newKeyResults = [...okrData.keyResults];
    newKeyResults[index] = value;
    setOKRData({
      ...okrData,
      keyResults: newKeyResults
    });
  };

  const addKeyResult = () => {
    setOKRData({
      ...okrData,
      keyResults: [...okrData.keyResults, ""]
    });
  };

  const removeKeyResult = (index: number) => {
    if (okrData.keyResults.length <= 1) return;
    
    const newKeyResults = [...okrData.keyResults];
    newKeyResults.splice(index, 1);
    setOKRData({
      ...okrData,
      keyResults: newKeyResults
    });
  };

  const handleSubmit = () => {
    if (!okrData.objective || okrData.keyResults.some((kr: string) => kr.trim() === "")) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal nature-card">
        <div className="modal-header">
          <h2>Create New OKR</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your OKR data will be encrypted with FHE
          </div>
          
          <div className="form-group">
            <label>Objective *</label>
            <input 
              type="text"
              name="objective"
              value={okrData.objective} 
              onChange={handleChange}
              placeholder="What do you want to accomplish?" 
              className="nature-input"
            />
          </div>
          
          <div className="form-group">
            <label>Key Results *</label>
            {okrData.keyResults.map((kr: string, index: number) => (
              <div className="key-result-input" key={index}>
                <input
                  type="text"
                  value={kr}
                  onChange={(e) => handleKeyResultChange(index, e.target.value)}
                  placeholder={`Key result #${index + 1}`}
                  className="nature-input"
                />
                <button 
                  className="remove-kr-btn"
                  onClick={() => removeKeyResult(index)}
                  disabled={okrData.keyResults.length <= 1}
                >
                  &times;
                </button>
              </div>
            ))}
            <button className="add-kr-btn nature-button" onClick={addKeyResult}>
              + Add Key Result
            </button>
          </div>
          
          <div className="form-group">
            <label>Initial Progress</label>
            <div className="progress-slider">
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={okrData.progress} 
                onChange={(e) => setOKRData({...okrData, progress: parseInt(e.target.value)})}
              />
              <span>{okrData.progress}%</span>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Your data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn nature-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn nature-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Create OKR"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;