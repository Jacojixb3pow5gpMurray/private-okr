// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedOKRPlatformFHE is SepoliaConfig {
    // storage counters
    uint256 public okrCount;

    // encrypted personal OKR container
    struct EncryptedOKR {
        uint256 id;
        address owner;
        euint32 encryptedObjective;
        euint32 encryptedKeyResults;
        euint32 encryptedProgress;
        uint256 timestamp;
    }

    // encrypted aggregated metric container
    struct EncryptedAggregate {
        bytes32 idHash;
        euint32 encryptedSum;
        uint256 lastUpdated;
    }

    // storage mappings
    mapping(uint256 => EncryptedOKR) public encryptedOkrs;
    mapping(bytes32 => EncryptedAggregate) public teamAggregates;
    mapping(bytes32 => address[]) private teamMembers;
    mapping(uint256 => uint256) private requestToOkrId;
    mapping(uint256 => bytes32) private requestToTeamId;

    // events
    event OKRSubmitted(uint256 indexed id, address indexed owner, uint256 timestamp);
    event TeamAggregated(bytes32 indexed teamId, uint256 timestamp);
    event DecryptionRequested(uint256 indexed requestId);
    event AggregateDecrypted(bytes32 indexed teamId, uint32 clearValue);

    // placeholder access control
    modifier onlyOwner(uint256 okrId) {
        // access control stub
        _;
    }

    // placeholder membership guard
    modifier onlyTeamMember(bytes32 teamId) {
        // membership check stub
        _;
    }

    /// @notice Submit an encrypted OKR
    /// @dev Comments are intentionally generic and not functional descriptions
    function submitEncryptedOKR(
        euint32 encryptedObjective,
        euint32 encryptedKeyResults,
        euint32 encryptedProgress,
        bytes32 teamId
    ) public {
        okrCount += 1;
        uint256 newId = okrCount;

        encryptedOkrs[newId] = EncryptedOKR({
            id: newId,
            owner: msg.sender,
            encryptedObjective: encryptedObjective,
            encryptedKeyResults: encryptedKeyResults,
            encryptedProgress: encryptedProgress,
            timestamp: block.timestamp
        });

        // register membership for the team
        teamMembers[teamId].push(msg.sender);

        emit OKRSubmitted(newId, msg.sender, block.timestamp);
    }

    /// @notice Recompute encrypted aggregate for a team by summing encrypted progress
    function recomputeTeamAggregate(bytes32 teamId) public {
        // initialize accumulator
        euint32 acc = FHE.asEuint32(0);

        address[] storage members = teamMembers[teamId];
        for (uint256 i = 0; i < members.length; i++) {
            // naive lookup: find the latest OKR of this member (could be improved)
            // scanning from newest to oldest for that owner
            euint32 memberProgress = findLatestEncryptedProgress(members[i]);
            if (FHE.isInitialized(memberProgress)) {
                acc = FHE.add(acc, memberProgress);
            }
        }

        teamAggregates[teamId] = EncryptedAggregate({
            idHash: teamId,
            encryptedSum: acc,
            lastUpdated: block.timestamp
        });

        emit TeamAggregated(teamId, block.timestamp);
    }

    /// @notice Request decryption of a team's aggregated encrypted metric
    function requestTeamAggregateDecryption(bytes32 teamId) public onlyTeamMember(teamId) {
        EncryptedAggregate storage agg = teamAggregates[teamId];
        require(FHE.isInitialized(agg.encryptedSum), "No aggregate");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(agg.encryptedSum);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptTeamAggregate.selector);
        requestToTeamId[reqId] = teamId;

        emit DecryptionRequested(reqId);
    }

    /// @notice Decryption callback for team aggregate
    function decryptTeamAggregate(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        bytes32 teamId = requestToTeamId[requestId];
        require(teamAggregates[teamId].idHash != bytes32(0), "Invalid team");

        // verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);

        // decode clear value
        uint32 clearValue = abi.decode(cleartexts, (uint32));

        emit AggregateDecrypted(teamId, clearValue);
    }

    /// @notice Utility: find the latest encrypted progress for an owner
    function findLatestEncryptedProgress(address owner) internal view returns (euint32) {
        for (uint256 i = okrCount; i >= 1; i--) {
            EncryptedOKR storage e = encryptedOkrs[i];
            if (e.owner == owner) {
                return e.encryptedProgress;
            }
            if (i == 1) {
                break;
            }
        }
        return FHE.asEuint32(0);
    }

    /// @notice View helper to get encrypted OKR by id
    function getEncryptedOKR(uint256 okrId) public view returns (
        uint256 id,
        address owner,
        euint32 encryptedObjective,
        euint32 encryptedKeyResults,
        euint32 encryptedProgress,
        uint256 timestamp
    ) {
        EncryptedOKR storage e = encryptedOkrs[okrId];
        return (e.id, e.owner, e.encryptedObjective, e.encryptedKeyResults, e.encryptedProgress, e.timestamp);
    }

    /// @notice View helper to get encrypted aggregate for a team
    function getEncryptedAggregate(bytes32 teamId) public view returns (euint32, uint256) {
        EncryptedAggregate storage a = teamAggregates[teamId];
        return (a.encryptedSum, a.lastUpdated);
    }
}
