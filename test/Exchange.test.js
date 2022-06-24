const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (value) => ethers.utils.parseEther(value.toString());
const fromWei = (value) =>
  ethers.utils.formatEther(
    typeof value === "string" ? value : value.toString()
  );

const { getBalance } = ethers.provider;

describe("Exchange", async () => {
  let owner;
  let user;
  let exchange;
  let token;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TKN", toWei(1_000_000));

    const Exchange = await ethers.getContractFactory("Exchange");
    exchange = await Exchange.deploy(token.address);
    await exchange.deployed();
  });

  describe("addLiquidity", async () => {
    it("adds liquidity", async () => {
      await token.approve(exchange.address, toWei(200));
      await exchange.addLiquidity(toWei(200), { value: toWei(100) });

      expect(await getBalance(exchange.address)).to.equal(toWei(100));
      expect(await exchange.getReserve()).to.equal(toWei(200));
    });
  });

  describe("getPrice", async () => {
    it("returns correct prices", async () => {
      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      const tokenReserve = await exchange.getReserve();
      const etherReserve = await getBalance(exchange.address);

      expect(await exchange.getPrice(etherReserve, tokenReserve)).to.eq(500);
      expect(await exchange.getPrice(tokenReserve, etherReserve)).to.eq(2000);
    });
  });

  describe("getTokenAmount", async () => {
    it("returns correct token amount", async () => {
      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let tokensOut = await exchange.getTokenAmount(toWei(1));
      expect(fromWei(tokensOut)).to.equal("1.998001998001998001");

      tokensOut = await exchange.getTokenAmount(toWei(100));
      expect(fromWei(tokensOut)).to.equal("181.818181818181818181");

      tokensOut = await exchange.getTokenAmount(toWei(1000));
      expect(fromWei(tokensOut)).to.equal("1000.0");
    });
  });

  describe("getEthAmount", async () => {
    it("returns correct eth amount", async () => {
      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let ethOut = await exchange.getEthAmount(toWei(2));
      expect(fromWei(ethOut)).to.equal("0.999000999000999");

      ethOut = await exchange.getEthAmount(toWei(100));
      expect(fromWei(ethOut)).to.equal("47.619047619047619047");

      ethOut = await exchange.getEthAmount(toWei(2000));
      expect(fromWei(ethOut)).to.equal("500.0");
    });
  });

  describe("ethToTokenSwap", async () => {
    beforeEach(async () => {
      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("reverts when output amount is less than minimum amount", async () => {
      const amountOut = toWei(2000)
        .mul(toWei(2))
        .div(toWei(1000).add(toWei(2)));
      await expect(
        exchange.ethToTokenSwap(amountOut.add(1), { value: toWei(2) })
      ).to.be.revertedWith("insufficient output amount");
    });

    it("allows 0 swaps", async () => {
      await exchange.connect(user).ethToTokenSwap(toWei(0), { value: 0 });

      const userTokenBalance = await token.balanceOf(user.address);
      expect(userTokenBalance).to.equal(0);

      const exchangeTokenBalance = await token.balanceOf(exchange.address);
      expect(exchangeTokenBalance).to.equal(toWei(2000));

      const exchangeEthBalance = await getBalance(exchange.address);
      expect(exchangeEthBalance).to.equal(toWei(1000));
    });

    it("sends out at least the minimum output amount", async () => {
      const ethExchangeAmount = toWei(1);
      const userEthBalanceBefore = fromWei(await getBalance(user.address));

      const amountOut = toWei(2000)
        .mul(ethExchangeAmount)
        .div(toWei(1000).add(ethExchangeAmount));

      await exchange
        .connect(user)
        .ethToTokenSwap(amountOut.sub(1), { value: ethExchangeAmount });

      const userEthBalanceAfter = await getBalance(user.address);
      expect(Math.round(Number(userEthBalanceBefore))).to.equal(
        Math.round(fromWei(userEthBalanceAfter.add(ethExchangeAmount)))
      );

      const userTokenBalanceAfter = await token.balanceOf(user.address);
      expect(userTokenBalanceAfter).to.equals(amountOut);

      const exhangeTokenBalance = await token.balanceOf(exchange.address);
      expect(exhangeTokenBalance).to.equal(toWei(2000).sub(amountOut));
    });

    const exchangeEthBalance = await getBalance(exchange.address);
    expect(exchangeEthBalance).to.equal(toWei(1000).sub(ethExchangeAmount));
  });

  describe("tokenToEthSwap", async () => {
    beforeEach(async () => {
      await token.transfer(user.address, toWei(2));
      await token.connect(user).approve(exchange.address, toWei(2));

      await token.approve(exchange.address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("reverts when output ETH amount is less than min amount", async () => {
      const tokenExchangeAmount = toWei(2);
      const amountOut = toWei(1000)
        .mul(tokenExchangeAmount)
        .div(toWei(2000).add(tokenExchangeAmount));
      await expect(
        exchange
          .connect(user)
          .tokenToEthSwap(tokenExchangeAmount, amountOut.add(1))
      ).to.be.revertedWith("insufficient output amount");
    });

    it("allows 0 swaps", async () => {
      const userEtherBalance = await getBalance(user.address);
      const userTokenBalance = await token.balanceOf(user.address);
      const exchangeEthBalance = await getBalance(exchange.address);
      const exhangeTokenBalance = await token.balanceOf(exchange.address);

      await exchange.connect(user).tokenToEthSwap(0, 0);

      expect(
        Math.round(Number(fromWei(await getBalance(user.address))))
      ).to.equal(Math.round(fromWei(userEtherBalance)));

      expect(await token.balanceOf(user.address)).to.equal(userTokenBalance);

      expect(await getBalance(exchange.address)).to.equal(exchangeEthBalance);

      expect(await token.balanceOf(exchange.address)).to.equal(
        exhangeTokenBalance
      );
    });

    it("transfers at least the minimum output amount of tokens", async () => {
      const userEtherBalance = await getBalance(user.address);
      const userTokenBalance = await token.balanceOf(user.address);
      const exchangeEthBalance = await getBalance(exchange.address);
      const exhangeTokenBalance = await token.balanceOf(exchange.address);

      const exchangeTokensAmount = toWei(2);
      const ethAmountOut = toWei(1000)
        .mul(exchangeTokensAmount)
        .div(toWei(2000).add(exchangeTokensAmount));

      await exchange
        .connect(user)
        .tokenToEthSwap(exchangeTokensAmount, ethAmountOut);

      const newUserEtherBalance = await getBalance(user.address);
      const newUserTokenBalance = await token.balanceOf(user.address);
      const newExchangeEthBalance = await getBalance(exchange.address);
      const newExhangeTokenBalance = await token.balanceOf(exchange.address);

      expect(userTokenBalance).to.equal(
        newUserTokenBalance.add(exchangeTokensAmount)
      );

      expect(exchangeEthBalance).to.equal(
        newExchangeEthBalance.add(ethAmountOut)
      );

      expect(exhangeTokenBalance).to.equal(
        newExhangeTokenBalance.sub(exchangeTokensAmount)
      );
    });
  });
});
