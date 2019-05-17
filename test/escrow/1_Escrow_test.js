var Escrow = artifacts.require("Escrow");
var TestToken = artifacts.require("TestToken");
var EscrowProxy = artifacts.require("EscrowProxy");
var Web3 = require("web3");
var web3 = new Web3("http://localhost:8555");
var BigNumber = require('bignumber.js');
var helper = require("../helper.js");

contract("Escrow Contract", function() {
  let acct;
  var repeatedScriptHash;

  before(async() => {
    
    acct = await helper.setupWallet();

    this.escrow = await Escrow.new({from:acct[0]});
    this.token = await TestToken.new(1000000000000000, "Open Bazaar", "OB", {from:acct[0]});
    this.escrowProxy = await EscrowProxy.new("0x0000000000000000000000000000000000000000");
       
});
    var getScriptHash = (uniqueId, threshold, timeoutHours, buyer, seller, moderator, tokenAddress) => {
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator,  this.escrow.address, tokenAddress);
        var scriptHash = helper.getScriptHash(redeemScript);
        return scriptHash;
    }
    var addNewTransaction = async(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount)=>{
        buyer = web3.utils.toChecksumAddress(buyer);
        seller = web3.utils.toChecksumAddress(seller);
        moderator = web3.utils.toChecksumAddress(moderator);

        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);

        repeatedScriptHash = scriptHash;
        var buyerBalanceBefore = await web3.eth.getBalance(buyer);
        var escrowContractBalanceBefore = await web3.eth.getBalance(this.escrow.address);

        buyerBalanceBefore = new BigNumber(buyerBalanceBefore);
        escrowContractBalanceBefore = new  BigNumber(escrowContractBalanceBefore);

        var txResult = await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, uniqueId, {from:acct[0], value:amount});

        var buyerBalanceAfter = await web3.eth.getBalance(buyer);
        var escrowContractBalanceAfter = await web3.eth.getBalance(this.escrow.address);

        escrowContractBalanceAfter = new BigNumber(escrowContractBalanceAfter);
        buyerBalanceAfter = new BigNumber(buyerBalanceAfter);
        
        var eventName = txResult.logs[0].event;
        var from = txResult.logs[0].args.from;
        var receivedScriptHash = txResult.logs[0].args.scriptHash;
        var amountEscrowed = txResult.logs[0].args.value;
        amountEscrowed = new BigNumber(amountEscrowed);
        assert.equal(eventName, "Funded", "Funded event should be fired");
        assert.equal(from, buyer, "Transaction was not sent from buyer's address: "+ buyer);
        assert.equal(receivedScriptHash, scriptHash, "Received script hash does not match the script hash sent");
        assert.equal(amountEscrowed.toNumber(), Number(amount), "Escrowed amount does not match with the actual amount sent");

        assert.isAtLeast(buyerBalanceBefore.minus(Number(amount)).toNumber(), buyerBalanceAfter.toNumber(), "Buyer's ether balance must reduce by escrowed amount: "+amount);
        assert.equal(escrowContractBalanceBefore.plus(Number(amount)).toNumber(), escrowContractBalanceAfter.toNumber(), "Escrow contract's ether balance must increase by escrowed amount: "+amount);

        //check whether the transaction stored in state is same as sent
        var transaction = await this.escrow.transactions(scriptHash);

        var receivedBuyer = transaction[6];
        var receivedSeller = transaction[7];
        var receivedAmount = transaction[0];
        var receivedStatus = transaction[2];
        var receivedTimeoutHours = transaction[5];
        var receivedThreshold = transaction[4];
        var receivedTransactionType = transaction[3];
        receivedAmount = new BigNumber(receivedAmount);
        assert.equal(receivedBuyer, buyer, "Received buyer does not match the buyer sent");
        assert.equal(receivedSeller, seller, "Received seller does not match the seller sent");
        assert.equal(receivedAmount.toNumber(), Number(amount), "Received amount does not match the amount sent");
        assert.equal(receivedStatus, 0, "Received status is not FUNDED(0)");
        assert.equal(receivedTimeoutHours, timeoutHours, "Received timeout hours does not match the timeout hours sent");
        assert.equal(receivedThreshold, threshold, "Received threshold does not match the threshold sent");
        assert.equal(receivedTransactionType, 0, "Received transaction type is not ETHER(0)");
    };  

    var addFundsToTransaction = async(scriptHash, buyer, amount) => {
        var buyerBalanceBefore = await web3.eth.getBalance(buyer);
        var escrowContractBalanceBefore = await web3.eth.getBalance(this.escrow.address);

        buyerBalanceBefore = new BigNumber(buyerBalanceBefore);
        escrowContractBalanceBefore = new  BigNumber(escrowContractBalanceBefore);

        txResult = await this.escrow.addFundsToTransaction(scriptHash, {from:buyer, value:amount});

        var buyerBalanceAfter = await web3.eth.getBalance(buyer);
        var escrowContractBalanceAfter = await web3.eth.getBalance(this.escrow.address);

        escrowContractBalanceAfter = new BigNumber(escrowContractBalanceAfter);
        buyerBalanceAfter = new BigNumber(buyerBalanceAfter);
        
        var eventName = txResult.logs[0].event;
        var from = txResult.logs[0].args.from;
        var receivedScriptHash = txResult.logs[0].args.scriptHash;
        var amountEscrowed = txResult.logs[0].args.valueAdded;
        amountEscrowed = new BigNumber(amountEscrowed);
        assert.equal(eventName, "FundAdded", "FundAdded event should be fired");
        assert.equal(from, buyer, "Transaction was sent from buyer's address: "+ buyer);
        assert.equal(receivedScriptHash, scriptHash, "Received script hash does not match the script hash sent");
        assert.equal(amountEscrowed.toNumber(), Number(amount), "Escrowed amount does not match with the actual amount sent");

        assert.isAtLeast(buyerBalanceBefore.minus(Number(amount)).toNumber(), buyerBalanceAfter.toNumber(), "Buyer's ether balance must reduce by escrowed amount: "+amount);
        assert.equal(escrowContractBalanceBefore.plus(Number(amount)).toNumber(), escrowContractBalanceAfter.toNumber(), "Escrow contract's ether balance must increase by escrowed amount: "+amount);

        //check whether the transaction stored in state is same as sent
        var transaction = await this.escrow.transactions(scriptHash);
       
        var receivedAmount = transaction[0];
        receivedAmount = new BigNumber(receivedAmount);
        assert.equal(receivedAmount.toNumber(), Number(amount) +Number(amount), "Received amount does not match the amount sent");
    };

    var executeTransaction = async(scriptHash, receivers, amounts, signers) => {
        var escrowContractBalanceBefore = await web3.eth.getBalance(this.escrow.address);
        var receiversBalanceBefore = new Array();

        for(var i=0;i<receivers.length;i++){
            var x = await web3.eth.getBalance(receivers[i]);
            receiversBalanceBefore.push(new BigNumber(x))
        }
        
        escrowContractBalanceBefore = new BigNumber(escrowContractBalanceBefore);

        var txHash = await this.escrowProxy.getTransactionHash(this.escrow.address, scriptHash, receivers, amounts);
        var sig = helper.signMessageHash(txHash, signers);

        var txResult = await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, receivers, amounts);

        var eventName = txResult.logs[0].event;
        var receivedScriptHash = txResult.logs[0].args.scriptHash;

        assert.equal(eventName, "Executed", "Executed event must be fired");
        assert.equal(receivedScriptHash, scriptHash, "Received script hash does not match the script hash of the transaction executed");

        var receiversBalanceAfter = new Array();
        for(var i=0;i<receivers.length;i++){
            var x = await web3.eth.getBalance(receivers[i]);
            receiversBalanceAfter.push(new BigNumber(x))
        }
       
        var escrowContractBalanceAfter = await web3.eth.getBalance(this.escrow.address);

        escrowContractBalanceAfter = new BigNumber(escrowContractBalanceAfter);
        var totalAmount = 0;
        for(var i=0; i<receivers.length; i++) {
            totalAmount += Number(amounts[i]);
            assert.equal(
                receiversBalanceBefore[i].plus(Number(amounts[i])).toNumber(), receiversBalanceAfter[i].toNumber(), "Receiver's balance must increase!!");
        }
        assert.equal(escrowContractBalanceBefore.minus(totalAmount).toNumber(), escrowContractBalanceAfter.toNumber(), "Escrow contract's ether balance must reduce by escrowed amount");
    };

    var executeTokenTx = async(scriptHash, receivers, amounts, signers)=> {
        
        var txHash = await this.escrowProxy.getTransactionHash(this.escrow.address, scriptHash, receivers, amounts);
        var sig = helper.signMessageHash(txHash, signers);
        
        var receiversBalanceBefore = new Array();

        for(var i=0;i<receivers.length;i++){
            var x = await this.token.balanceOf(receivers[i]);
            receiversBalanceBefore.push(new BigNumber(x))
        }
        var escrowContractBalanceBefore = await this.token.balanceOf(this.escrow.address);
        escrowContractBalanceBefore = new BigNumber(escrowContractBalanceBefore);

        txResult = await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, receivers, amounts);

        var eventName = txResult.logs[0].event;
        var receivedScriptHash = txResult.logs[0].args.scriptHash;

        assert.equal(eventName, "Executed", "Executed event must be fired");
        assert.equal(receivedScriptHash, scriptHash, "Received script hash does not match the script hash of the transaction executed");

        var receiversBalanceAfter = new Array();
        for(var i=0;i<receivers.length;i++){
            var x = await this.token.balanceOf(receivers[i]);
            receiversBalanceAfter.push(new BigNumber(x))
        }
        var escrowContractBalanceAfter = await this.token.balanceOf(this.escrow.address);
        escrowContractBalanceAfter = new BigNumber(escrowContractBalanceAfter);
        var totalAmount = 0;
        for(var i=0; i<receivers.length; i++) {
            totalAmount += Number(amounts[i]);
            assert.equal(
                receiversBalanceBefore[i].plus(Number(amounts[i])).toNumber(), receiversBalanceAfter[i].toNumber(), "Receiver's balance must increase!!");
        }
       assert.equal(escrowContractBalanceBefore.minus(totalAmount).toNumber(), escrowContractBalanceAfter.toNumber(), "Escrow contract's token balance must reduce by escrowed amount");
    };

    var addTokenTransaction = async(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount) => {

        buyer = web3.utils.toChecksumAddress(buyer);
        seller = web3.utils.toChecksumAddress(seller);
        moderator = web3.utils.toChecksumAddress(moderator);
        await this.token.approve(this.escrow.address, amount, {from:buyer});

        var buyerBalanceBefore = await this.token.balanceOf(buyer);
        var escrowContractBalanceBefore = await this.token.balanceOf(this.escrow.address);

        buyerBalanceBefore = new BigNumber(buyerBalanceBefore);
        escrowContractBalanceBefore = new BigNumber(escrowContractBalanceBefore);

        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        
        txResult = await this.escrow.addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, amount, uniqueId, this.token.address, {from:acct[0]});

        var buyerBalanceAfter = await this.token.balanceOf(buyer);
        var escrowContractBalanceAfter = await this.token.balanceOf(this.escrow.address);

        escrowContractBalanceAfter = new BigNumber(escrowContractBalanceAfter);
        buyerBalanceAfter = new BigNumber(buyerBalanceAfter);
        
        var eventName = txResult.logs[0].event;
        var from = txResult.logs[0].args.from;
        var receivedScriptHash = txResult.logs[0].args.scriptHash;
        var amountEscrowed = txResult.logs[0].args.value;
        amountEscrowed = new BigNumber(amountEscrowed);
        assert.equal(eventName, "Funded", "Funded event should be fired");
        assert.equal(from, buyer, "Transaction was sent from buyer's address: "+ buyer);
        assert.equal(receivedScriptHash, scriptHash, "Received script hash does not match the script hash sent");
        assert.equal(amountEscrowed.toNumber(), Number(amount), "Escrowed amount does not match with the actual amount sent");

        assert.equal(buyerBalanceBefore.minus(Number(amount)).toNumber(), buyerBalanceAfter.toNumber(), "Buyer's token balance must reduce by escrowed amount: "+amount);
        assert.equal(escrowContractBalanceBefore.plus(Number(amount)).toNumber(), escrowContractBalanceAfter.toNumber(), "Escrow contract's token balance must increase by escrowed amount: "+amount);

        //check whether the transaction stored in state is same as sent
        var transaction = await this.escrow.transactions(scriptHash);

        var receivedBuyer = transaction[6];
        var receivedSeller = transaction[7];
        var receivedAmount = transaction[0];
        var receivedStatus = transaction[2];
        var receivedTimeoutHours = transaction[5];
        var receivedThreshold = transaction[4];
        var receivedTransactionType = transaction[3];
        var receivedTokenAddress = transaction[8];
        receivedAmount = new BigNumber(receivedAmount);
        assert.equal(receivedBuyer, buyer, "Received buyer does not match the buyer sent");
        assert.equal(receivedSeller, seller, "Received seller does not match the seller sent");
        assert.equal(receivedAmount.toNumber(), Number(amount), "Received amount does not match the amount sent");
        assert.equal(receivedStatus, 0, "Received status is not FUNDED(0)");
        assert.equal(receivedTimeoutHours, timeoutHours, "Received timeout hours does not match the timeout hours sent");
        assert.equal(receivedThreshold, threshold, "Received threshold does not match the threshold sent");
        assert.equal(receivedTransactionType, 1, "Received transaction type is not TOKEN(1)");
        assert.equal(receivedTokenAddress, this.token.address, "Received token address does not match the token address sent");
    };


    var addFundToTokenTx = async(scriptHash, amount, buyer) => {
        
        var buyerBalanceBefore = await this.token.balanceOf(buyer);
        var escrowContractBalanceBefore = await this.token.balanceOf(this.escrow.address);
        buyerBalanceBefore = new BigNumber(buyerBalanceBefore);
        escrowContractBalanceBefore = new BigNumber(escrowContractBalanceBefore);

        var txResult = await this.token.approve(this.escrow.address, amount, {from:buyer});
        txResult = await this.escrow.addTokensToTransaction(scriptHash, amount,{from:buyer});

        var buyerBalanceAfter = await this.token.balanceOf(buyer);
        var escrowContractBalanceAfter = await this.token.balanceOf(this.escrow.address);
        escrowContractBalanceAfter = new BigNumber(escrowContractBalanceAfter);
        buyerBalanceAfter = new BigNumber(buyerBalanceAfter);
        var eventName = txResult.logs[0].event;
        var from = txResult.logs[0].args.from;
        var receivedScriptHash = txResult.logs[0].args.scriptHash;
        var amountEscrowed = txResult.logs[0].args.valueAdded;
        amountEscrowed = new BigNumber(amountEscrowed);

        assert.equal(eventName, "FundAdded", "Funded event should be fired");
        assert.equal(from, buyer, "Transaction was sent from buyer's address: "+ buyer);
        assert.equal(receivedScriptHash, scriptHash, "Received script hash does not match the script hash sent");
        assert.equal(amountEscrowed.toNumber(), Number(amount), "Escrowed amount does not match with the actual amount sent");
        assert.equal(buyerBalanceBefore.minus(Number(amount)).toNumber(), buyerBalanceAfter.toNumber(), "Buyer's token balance must reduce by escrowed amount: "+amount);
        assert.equal(escrowContractBalanceBefore.plus(Number(amount)).toNumber(), escrowContractBalanceAfter.toNumber(), "Escrow contract's token balance must increase by escrowed amount: "+amount);
        
        //check whether the transaction stored in state is same as sent
        var transaction = await this.escrow.transactions(scriptHash);
        var receivedAmount = transaction[0];
        var receivedStatus = transaction[2];
        var receivedTokenAddress = transaction[8];
        receivedAmount = new BigNumber(receivedAmount);
        assert.equal(receivedAmount.toNumber(), Number(amount) + Number(amount), "Received amount does not match the amount sent");
        assert.equal(receivedStatus, 0, "Received status is not FUNDED(0)");
        assert.equal(receivedTokenAddress, this.token.address, "Received token address does not match the token address sent");
    }; 

    it("Add new transaction", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);        
    });

    it("Add new 1-of-2 multisig escrow transaction with moderator address as zero address", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = "0x0000000000000000000000000000000000000000";
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
    });

    it("Add new 1-of-2 multisig escrow transaction with moderator address as non-zero address", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[3]);
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
    });

    it("Add funds to ETHER transaction", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");
        
        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        await addFundsToTransaction(scriptHash, buyer, amount);
    });

    it("Add funds to ETHER transaction from non-buyer account", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");        

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await addFundsToTransaction(scriptHash, acct[9], amount);
            assert.equal(true, false, "Should not be able to add funds to transaction from account other than buyer's");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with same buyer and seller", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[0]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with same buyer and seller");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with 0 value", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("0", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with 0 value");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with threshold greater than number of parties involved", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 4;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with threshold greater than number of parties involved");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
       
    });

    it("Add new transaction with threshold 0", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 0;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with threshold 0");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
       
    });

    it("Add new transaction with moderator being one of the buyer or seller", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = buyer;
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with moderator being one of buyer or seller");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with buyer being zero address", async()=>{
        var buyer = "0x";
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with buyer being zero address");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with seller being zero address", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = "0x";
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with seller being zero address");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with moderator being zero address", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = "0x";
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");

       try{
            await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
            assert.equal(true, false, "Should not be able to add transaction with moderator being zero address");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new transaction with previously added script hash", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;        
        var amount = web3.utils.toWei("1", "ether");        
        
        try{
            await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, repeatedScriptHash, uniqueId, {from:acct[0], value:amount});
            assert.equal(true, false, "Should not be able to add transaction with script hash which has previously been added");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });
    
    it("Execute Ether Transaction", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether")
        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);

        await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [seller, moderator, buyer]);
    });

    it("Execute Ether Transaction(1-of-2 multisig) using seller signature", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = "0x0000000000000000000000000000000000000000";
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);

        await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller], [seller]);
    });
    
    it("Execute Ether Transaction(1-of-2 multisig) using buyer signature", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = "0x0000000000000000000000000000000000000000";
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller], [buyer]);
    });

    it("Execute Ether Transaction(1-of-2 multisig) using moderator signature", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[3];
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("1", "ether");
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller], [ moderator]);
            assert.equal(true, false, "Moderator should not be able to execute 1-of-2 multisig escrow transaction");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Ether Transaction with scripthash that does not exists in the contract", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);

        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute transaction with scripthash that does not exist in the contract");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute already executed Transaction where all funds are released", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute already executed transaction");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add Transaction with wrong unique id", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        
        uniqueId = helper.getUniqueId();
        try{
            await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, uniqueId, {from:acct[0], value:web3.utils.toWei("1", "ether")});
            assert.equal(true, false, "Should not be able to add transaction with wrong unique id");
        } catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with invalid signature", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");

        await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, uniqueId, {from:acct[0], value:web3.utils.toWei("1", "ether")});
        var txHash = await this.escrowProxy.getTransactionHash(this.escrow.address, scriptHash, [seller, moderator], [web3.utils.toWei("0.8", "ether"), amountToBeGivenToModerator]);
        var sig = helper.signMessageHash(txHash, [buyer, seller, moderator]);
        uniqueId = helper.getUniqueId();
        try{
            await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
            assert.equal(true, false, "Should not be able to execute transaction with invalid signature");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    }); 

    it("Execute Transaction with less number of signatures than required", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether");
        
        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller]);
            assert.equal(true, false, "Should not be able to execute transaction with less number of signatures than required");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with one of the signature's being of non-owner", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, acct[4]]);
            assert.equal(true, false, "Should not be able to execute transaction with non-owner's signature");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with one of the destination being non-owner address", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller, acct[4]], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute transaction with one of the destinations being non-owner address");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with total value being sent greater than overall transaction value", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute transaction with total value being sent greater than overall transaction value");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with duplicate signatures", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, seller]);
            assert.equal(true, false, "Should not be able to execute transaction with duplicate signatures!!");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with total value being sent smaller than overall transaction value", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.8", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.2", "ether");
        var released = Number(amountToBeGivenToModerator) + Number(amountToBeGivenToSeller);
        var amount = web3.utils.toWei("2", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
        var transaction = await this.escrow.transactions(scriptHash);
        var releasedAmount = transaction[10];
        var noOfReleases = transaction[11];
        assert.equal(released, Number(releasedAmount), "Amount sent to release and released amounts must match!!");
        assert.equal(1, Number(noOfReleases), "Number of releases by now should be 1");
        await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
        var transaction = await this.escrow.transactions(scriptHash);
        var releasedAmount = transaction[10];
        var noOfReleases = transaction[11];
        assert.equal(released * 2, Number(releasedAmount), "Amount sent to release and released amounts must match!!");
        assert.equal(2, Number(noOfReleases), "Number of releases by now should be 2");
    });

    it("Execute Transaction with same signature being sent twice", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("0.8", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.2", "ether");
        var released = Number(amountToBeGivenToModerator) + Number(amountToBeGivenToSeller);
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address);
        var scriptHash = helper.getScriptHash(redeemScript);

        await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, uniqueId, {from:acct[0], value:web3.utils.toWei("2", "ether")});
        var txHash = await this.escrowProxy.getTransactionHash(this.escrow.address, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
        var sig = helper.signMessageHash(txHash, [buyer, seller, moderator]);
        await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
        var transaction = await this.escrow.transactions(scriptHash);
        var releasedAmount = transaction[10];
        var noOfReleases = transaction[11];
        assert.equal(released, Number(releasedAmount), "Amount sent to release and released amounts must match!!");
        assert.equal(1, Number(noOfReleases), "Number of releases by now should be 1");
        try{
            await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
            assert.equal(true, false, "Should not be able to execute transaction with same old signature");

        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with one of the sent amount being 0", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute transaction with one of the sent amount being 0");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with no destination", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute transaction with no destination");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with number of destinations and amount in mismatch", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
            assert.equal(true, false, "Should not be able to execute Transaction with number of destinations and amount in mismatch");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute transaction after timeout by seller account", async()=>{

        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        //simulate timeout
        await helper.increaseTime(6 * 60 * 60 + 10);
        await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller], [seller]);
    });

    it("Execute transaction after timeout by non-seller account", async()=>{

        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        //simulate timeout
        await helper.increaseTime(6 * 60 * 60 + 10);
        try{
            await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller], [buyer]);
            assert.equal(true, false, "Should not be able to execute transaction after timeout by non-seller account");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute transaction before timeout by seller account", async()=>{

        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        var amountToBeGivenToSeller = web3.utils.toWei("1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        try{
            await executeTransaction(scriptHash, [seller], [amountToBeGivenToSeller], [seller]);
            assert.equal(true, false, "Should not be able to execute transaction before timeout by seller account unilaterally");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Execute Transaction with threshold as 1", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToBuyer = web3.utils.toWei("1", "ether");
        var amount = web3.utils.toWei("1", "ether");

        await addNewTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator);
        await executeTransaction(scriptHash, [buyer], [amountToBeGivenToBuyer], [buyer]);
    });

    it("Add new Token transaction", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");
        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
    });

    it("Add 1-of-2 Token transaction with moderator address as zero address", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = "0x0000000000000000000000000000000000000000";
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");
        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
    });

    it("Add 1-of-2 Token transaction with moderator address as non-zero address", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[3]);
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");
        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
    });

    it("Add funds to Token transaction", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");
        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        await addFundToTokenTx(scriptHash, amount, buyer); 
    });

    it("Add funds to Token transaction from non-buyer's account", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");
        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        try{
            await addFundToTokenTx(scriptHash, amount, seller); 
            assert.equal(true, false, "Should not be able to add funds to the transaction from non-buyer's account");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }        
    });

    it("Add new Token transaction without apporving the escrow contract to transfer required amount of tokens on behalf of sender", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");

        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address, this.token.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        try{
            await this.escrow.addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, amount, uniqueId, this.token.address, {from:acct[0]});
            assert.equal(true, false, "Should not be able to add transaction without apporving the escrow contract to transfer required amount of tokens on behalf of sender");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Add new Token transaction by approving less amount of tokens then required", async()=>{
        var buyer = web3.utils.toChecksumAddress(acct[0]);
        var seller = web3.utils.toChecksumAddress(acct[1]);
        var moderator = web3.utils.toChecksumAddress(acct[2]);
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amount = web3.utils.toWei("100", "ether");

        await this.token.approve(this.escrow.address, web3.utils.toWei("10", "ether"), {from:buyer});
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address, this.token.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        try{
            txResult = await this.escrow.addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, amount, uniqueId, this.token.address, {from:acct[0]});
            assert.equal(true, false, "Should not be able to add transaction by approving less amount of tokens then required");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }        
    });

    it("Execute Token Transaction", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("90", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("10", "ether");
        var amount = web3.utils.toWei("100", "ether");
        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        await executeTokenTx(scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator], [buyer, seller, moderator]);
    });

    it("Execute 1-of-2 escrow Token Transaction with moderator address as zero address and seller as signer", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = "0x0000000000000000000000000000000000000000";
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("100", "ether");
        var amount = web3.utils.toWei("100", "ether");

        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        await executeTokenTx(scriptHash, [seller], [amountToBeGivenToSeller], [seller]);
    });

    it("Execute 1-of-2 escrow Token Transaction with moderator address as non-zero address and seller as signer", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("100", "ether");
        var amount = web3.utils.toWei("100", "ether");

        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        await executeTokenTx(scriptHash, [seller], [amountToBeGivenToSeller], [seller]);
    });

    it("Execute 1-of-2 escrow Token Transaction with moderator address as non-zero address and moderator as signer", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 1;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var amountToBeGivenToSeller = web3.utils.toWei("100", "ether");
        var amount = web3.utils.toWei("100", "ether");

        await addTokenTransaction(buyer, seller, moderator, threshold, timeoutHours, uniqueId, amount);
        var scriptHash = getScriptHash(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.token.address);
        try{
            await executeTokenTx(scriptHash, [seller], [amountToBeGivenToSeller], [moderator]);
            assert.equal(true, false, "Should not be able to execute transaction using moderator's signature");
        }catch(error){
            assert.notInclude(error.toString(), 'AssertionError', error.message);
        }
    });

    it("Check for valid beneficiaries", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 3;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");

        await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, uniqueId, {from:acct[0], value:web3.utils.toWei("1", "ether")});
        var txHash = await this.escrowProxy.getTransactionHash(this.escrow.address, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
        var sig = helper.signMessageHash(txHash, [buyer, seller, moderator]);
        await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
        var check = await this.escrow.checkBeneficiary(scriptHash, seller);
        assert.equal(check, true, "Seller should be a valid beneficiary");
        check = await this.escrow.checkBeneficiary(scriptHash, moderator);
        assert.equal(check, true, "Moderator should be a valid beneficiary");
    });

    it("Check for valid signers", async()=>{
        var buyer = acct[0];
        var seller = acct[1];
        var moderator = acct[2];
        var threshold = 2;
        var timeoutHours = 6;
        var uniqueId = helper.getUniqueId();
        var redeemScript = helper.generateRedeemScript(uniqueId, threshold, timeoutHours, buyer, seller, moderator, this.escrow.address);
        var scriptHash = helper.getScriptHash(redeemScript);
        var amountToBeGivenToSeller = web3.utils.toWei("0.9", "ether");
        var amountToBeGivenToModerator = web3.utils.toWei("0.1", "ether");

        await this.escrow.addTransaction(buyer, seller, moderator, threshold, timeoutHours, scriptHash, uniqueId, {from:acct[0], value:web3.utils.toWei("1", "ether")});
        var txHash = await this.escrowProxy.getTransactionHash(this.escrow.address, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
        var sig = helper.signMessageHash(txHash, [buyer, seller]);
        await this.escrow.execute(sig.sigV, sig.sigR, sig.sigS, scriptHash, [seller, moderator], [amountToBeGivenToSeller, amountToBeGivenToModerator]);
        var check = await this.escrow.checkVote(scriptHash, seller);
        assert.equal(check, true, "Seller should be a valid signer");
        check = await this.escrow.checkVote(scriptHash, moderator);
        assert.equal(check, false, "Moderator should be not be a valid signer ");
    });    
});