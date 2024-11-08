import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, ContractFactory, ContractTransactionResponse } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const factoryArtifact = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const routerArtifact = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const pairArtifact = require("@uniswap/v2-periphery/build/IUniswapV2Pair.json");
const wethArtifact = require("../WETH.json");

async function reportGas(txPromise: Promise<any>, methodName: string) {
  // const gasEstimate = (await txPromise).estimateGas();
  const tx = await txPromise;
  const receipt = await tx.wait();
  
  console.log(`
    Gas Report for ${methodName}:
    Actual Gas Used: ${receipt?.gasUsed}
    Gas Price: ${tx.gasPrice} wei
    Total Cost: ${ethers.formatEther(receipt?.gasUsed * tx.gasPrice)} ETH
  `);
  
  return receipt;
}

describe("Uniswap Deployment", function () {
  let factory: any;
  let token1: any;
  let token2: any;
  let router: any;
  let weth: any;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;

  before(async function () {
    // Get signers
    [owner, addr1] = await ethers.getSigners();

    // Deploy WETH
    const WETH = new ContractFactory(wethArtifact.abi, wethArtifact.bytecode, owner);
    weth = await WETH.deploy();
    await weth.waitForDeployment();

    // Deploy Factory
    const Factory = new ContractFactory(
      factoryArtifact.abi,
      factoryArtifact.bytecode,
      owner
    );
    factory = await Factory.deploy(owner.address);
    await factory.waitForDeployment();

    // Deploy Router
    const Router = new ContractFactory(
      routerArtifact.abi,
      routerArtifact.bytecode,
      owner
    );
    router = await Router.deploy(
      await factory.getAddress(),
      await weth.getAddress()
    );
    await router.waitForDeployment();

    // Deploy test tokens
    const TestToken = await ethers.getContractFactory("TestToken");
    token1 = await TestToken.deploy(
      "Token1",
      "TK1"
    );
    token2 = await TestToken.deploy(
      "Token2",
      "TK2"
    );
    await token1.waitForDeployment();
    await token2.waitForDeployment();
  });

  it("Should deploy Factory with correct feeToSetter", async function () {
    expect(await factory.feeToSetter()).to.equal(owner.address);
  });

  it("Should deploy Router with correct factory and WETH", async function () {
    expect(await router.factory()).to.equal(await factory.getAddress());
    expect(await router.WETH()).to.equal(await weth.getAddress());
  });

  it("Should create a pair", async function () {
    await factory.createPair(
      await token1.getAddress(),
      await token2.getAddress()
    );
    const pairAddress = await factory.getPair(
      await token1.getAddress(),
      await token2.getAddress()
    );
    expect(pairAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("Should allow adding liquidity", async function () {
    // Approve router to spend tokens
    await token1.approve(
      await router.getAddress(),
      ethers.parseEther("1000")
    );
    await token2.approve(
      await router.getAddress(),
      ethers.parseEther("1000")
    );

    // Add liquidity
    const latestBlock = await ethers.provider.getBlock('latest');
    const deadline = (latestBlock?.timestamp || Math.floor(Date.now() / 1000)) + 60 * 20;

    // Estimate gas
    const gasEstimate = await router.addLiquidity.estimateGas(
      await token1.getAddress(),
      await token2.getAddress(),
      ethers.parseEther("100"),
      ethers.parseEther("100"),
      0,
      0,
      owner.address,
      deadline
    );

    // Execute transaction and get receipt
    const tx = await router.addLiquidity(
      await token1.getAddress(),
      await token2.getAddress(),
      ethers.parseEther("100"),
      ethers.parseEther("100"),
      0,
      0,
      owner.address,
      deadline
    );
    await reportGas(tx, "addLiquidity");

    // Get pair contract
    const pairAddress = await factory.getPair(
      await token1.getAddress(),
      await token2.getAddress()
    );
    const Pair = new Contract(pairAddress, pairArtifact.abi, owner);
    
    // Check reserves
    const reserves = await Pair.getReserves();
    expect(reserves[0]).to.not.equal(0);
    expect(reserves[1]).to.not.equal(0);
  });
});