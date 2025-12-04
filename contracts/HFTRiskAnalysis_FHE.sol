// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract HFTRiskAnalysis_FHE is SepoliaConfig {
    struct EncryptedOrderBook {
        uint256 exchangeId;
        euint32 encryptedBidOrders;
        euint32 encryptedAskOrders;
        euint32 encryptedOrderFlow;
        euint32 encryptedVolatility;
        uint256 timestamp;
        address exchange;
    }

    struct RiskAssessment {
        euint32 encryptedLiquidityImpact;
        euint32 encryptedFlashCrashRisk;
        euint32 encryptedMarketInstability;
    }

    struct DecryptedAssessment {
        uint32 liquidityImpact;
        uint32 flashCrashRisk;
        uint32 marketInstability;
        bool isRevealed;
    }

    uint256 public exchangeCount;
    mapping(uint256 => EncryptedOrderBook) public orderBooks;
    mapping(uint256 => RiskAssessment) public riskAssessments;
    mapping(uint256 => DecryptedAssessment) public decryptedAssessments;

    mapping(uint256 => uint256) private requestToExchangeId;
    
    event OrderBookSubmitted(uint256 indexed exchangeId, address indexed exchange, uint256 timestamp);
    event RiskAnalysisCompleted(uint256 indexed exchangeId);
    event AssessmentDecrypted(uint256 indexed exchangeId);

    function registerExchange(address exchange) public returns (uint256) {
        exchangeCount += 1;
        return exchangeCount;
    }

    function submitEncryptedOrderBook(
        euint32 encryptedBidOrders,
        euint32 encryptedAskOrders,
        euint32 encryptedOrderFlow,
        euint32 encryptedVolatility,
        address exchange
    ) public {
        uint256 exchangeId = registerExchange(exchange);
        
        orderBooks[exchangeId] = EncryptedOrderBook({
            exchangeId: exchangeId,
            encryptedBidOrders: encryptedBidOrders,
            encryptedAskOrders: encryptedAskOrders,
            encryptedOrderFlow: encryptedOrderFlow,
            encryptedVolatility: encryptedVolatility,
            timestamp: block.timestamp,
            exchange: exchange
        });

        assessRisk(exchangeId);
        emit OrderBookSubmitted(exchangeId, exchange, block.timestamp);
    }

    function assessRisk(uint256 exchangeId) private {
        EncryptedOrderBook storage orderBook = orderBooks[exchangeId];
        
        riskAssessments[exchangeId] = RiskAssessment({
            encryptedLiquidityImpact: FHE.div(
                FHE.sub(orderBook.encryptedBidOrders, orderBook.encryptedAskOrders),
                FHE.asEuint32(100)
            ),
            encryptedFlashCrashRisk: FHE.mul(
                orderBook.encryptedOrderFlow,
                FHE.asEuint32(2)
            ),
            encryptedMarketInstability: FHE.add(
                FHE.mul(orderBook.encryptedVolatility, FHE.asEuint32(3)),
                FHE.div(orderBook.encryptedOrderFlow, FHE.asEuint32(5))
            )
        });

        decryptedAssessments[exchangeId] = DecryptedAssessment({
            liquidityImpact: 0,
            flashCrashRisk: 0,
            marketInstability: 0,
            isRevealed: false
        });

        emit RiskAnalysisCompleted(exchangeId);
    }

    function requestAssessmentDecryption(uint256 exchangeId) public {
        require(msg.sender == orderBooks[exchangeId].exchange, "Not exchange owner");
        require(!decryptedAssessments[exchangeId].isRevealed, "Already decrypted");

        RiskAssessment storage assessment = riskAssessments[exchangeId];
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(assessment.encryptedLiquidityImpact);
        ciphertexts[1] = FHE.toBytes32(assessment.encryptedFlashCrashRisk);
        ciphertexts[2] = FHE.toBytes32(assessment.encryptedMarketInstability);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAssessment.selector);
        requestToExchangeId[reqId] = exchangeId;
    }

    function decryptAssessment(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 exchangeId = requestToExchangeId[requestId];
        require(exchangeId != 0, "Invalid request");

        DecryptedAssessment storage dAssessment = decryptedAssessments[exchangeId];
        require(!dAssessment.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        (uint32 liquidityImpact, uint32 crashRisk, uint32 instability) = 
            abi.decode(cleartexts, (uint32, uint32, uint32));
        
        dAssessment.liquidityImpact = liquidityImpact;
        dAssessment.flashCrashRisk = crashRisk;
        dAssessment.marketInstability = instability;
        dAssessment.isRevealed = true;

        emit AssessmentDecrypted(exchangeId);
    }

    function requestOrderBookDecryption(uint256 exchangeId) public {
        require(msg.sender == orderBooks[exchangeId].exchange, "Not exchange owner");
        
        EncryptedOrderBook storage orderBook = orderBooks[exchangeId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(orderBook.encryptedBidOrders);
        ciphertexts[1] = FHE.toBytes32(orderBook.encryptedAskOrders);
        ciphertexts[2] = FHE.toBytes32(orderBook.encryptedOrderFlow);
        ciphertexts[3] = FHE.toBytes32(orderBook.encryptedVolatility);
        
        FHE.requestDecryption(ciphertexts, this.decryptOrderBook.selector);
    }

    function decryptOrderBook(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        (uint32 bids, uint32 asks, uint32 flow, uint32 volatility) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        // Process decrypted order book data as needed
    }

    function getExchangeCount() public view returns (uint256) {
        return exchangeCount;
    }
}