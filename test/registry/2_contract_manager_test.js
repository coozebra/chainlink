var ContractManager = artifacts.require("ContractManager");
var Escrow = artifacts.require("Escrow");

contract("Contract Manager contract", function(accounts) {
  var ownerAccount = accounts[0];
  var contracts = new Array();
  var contractVersions = new Object();
  var versions = new Array();

  before(async () => {
    this.contractManager = await ContractManager.new({ from: ownerAccount });

    contracts[0] = "escrow";
    versions[0] = new Array();
    versions[0][0] = "v1.0";
    versions[0][1] = "v1.1";
  });

  var addVersion = async(contractName, version, status, _implementation) => {
    var txResult = await this.contractManager.addVersion(
      contractName,
      version,
      status,
      _implementation
    );
    var eventName = txResult.logs[0].event;
    var receivedContractName = txResult.logs[0].args.contractName;
    var receivedVersion = txResult.logs[0].args.versionName;
    var receivedImplementation = txResult.logs[0].args.implementation;

    assert.equal(eventName, "VersionAdded", "VersionAdded event must be fired");
    assert.equal(
      receivedContractName,
      contractName,
      "Received contract name must match the passed one"
    );
    assert.equal(
      receivedVersion,
      version,
      "Received version must match the passed one"
    );
    assert.equal(
      receivedImplementation,
      _implementation,
      "Received implementation must match the passed one"
    );

    var versionData = await this.contractManager.getVersionDetails(
      contractName,
      version
    );
    receivedVersion = versionData[0];
    var receivedStatus = versionData[1].toNumber();
    var receivedbugLevel = versionData[2].toNumber();
    receivedImplementation = versionData[3];

    assert.equal(
      receivedVersion,
      version,
      "Received version must match the passed one"
    );
    assert.equal(
      receivedStatus,
      status,
      "Received staus must be the one which was passed"
    );
    assert.equal(receivedbugLevel, 0, "Received bug level must be NONE(0)");
    assert.equal(
      receivedImplementation,
      _implementation,
      "Received implementation must match the passed one"
    );
    
    if(contractVersions[contractName] === undefined){
      contractVersions[contractName] = new Object();
    }
    contractVersions[contractName][version] = new Object();
    contractVersions[contractName][version].version = receivedVersion;
    contractVersions[contractName][version].status = receivedStatus;
    contractVersions[contractName][version].bugLevel = receivedbugLevel;
    contractVersions[contractName][version].implementation = receivedImplementation;
  };

  var updateVersion = async(contractName, version, status, bugLevel) => {
    var txResult = await this.contractManager.updateVersion(
      contractName,
      version,
      status,
      bugLevel
    );

    var eventName = txResult.logs[0].event;
    var receivedContractName = txResult.logs[0].args.contractName;
    var receivedVersion = txResult.logs[0].args.versionName;
    var receivedStatus = txResult.logs[0].args.status;
    var receivedBugLevel = txResult.logs[0].args.bugLevel;

    assert.equal(eventName, "VersionUpdated", "VersionUpdated must be fired");
    assert.equal(
      receivedVersion,
      version,
      "Received version must match the passed one"
    );
    assert.equal(
      receivedStatus,
      status,
      "Received status must be the one which was passed"
    );
    assert.equal(
      receivedContractName,
      contractName,
      "Received contract name must match the passed contract name"
    );
    assert.equal(
      receivedBugLevel,
      bugLevel,
      "Received bug level must be the one which was passed"
    );

    var versionData = await this.contractManager.getVersionDetails(
      contractName,
      version
    );

    receivedStatus = versionData[1].toNumber();

    assert.equal(
      receivedStatus,
      status,
      "Received staus must be correctly set in the storage"
    );
    contractVersions[contractName][version].status = status;
  };

  var markRecommended = async(contractName, version) => {
    var txResult = await this.contractManager.markRecommendedVersion(
      contractName,
      version
    );

    var eventName = txResult.logs[0].event;
    var receivedContractName = txResult.logs[0].args.contractName;
    var receivedVersion = txResult.logs[0].args.versionName;

    assert.equal(
      eventName,
      "VersionRecommended",
      "VersionRecommended must be fired"
    );
    assert.equal(
      receivedVersion,
      version,
      "Received version must match the passed one"
    );
    assert.equal(
      receivedContractName,
      contractName,
      "Received contract name must match the passed contract name"
    );

    var versionData = await this.contractManager.getRecommendedVersion(
      contractName
    );

    receivedVersion = versionData[0];

    var receivedImplementation = versionData[3];

    assert.equal(
      receivedVersion,
      version,
      "Received version must match the passed one"
    );

    assert.equal(
      receivedImplementation,
      contractVersions[contractName][version].implementation,
      "Recommended version's implementation address must with the actual set one"
    );
  };

  var removeRecommendedVersion = async(contractName) => {
    var versionData = await this.contractManager.getRecommendedVersion(
      contractName
    );

    var version = versionData[0];

    var txResult = await this.contractManager.removeRecommendedVersion(
      contractName
    );

    var eventName = txResult.logs[0].event;
    var receivedContractName = txResult.logs[0].args.contractName;

    assert.equal(
      eventName,
      "RecommendedVersionRemoved",
      "RecommendedVersionRemoved must be fired"
    );
    assert.equal(
      receivedContractName,
      contractName,
      "Received contract name must match the passed contract name"
    );

    var versionData = await this.contractManager.getRecommendedVersion(
      contractName
    );

    var receivedVersion = versionData[0];

    assert.equal(
      receivedVersion,
      "",
      "Recommended version should have been removed"
    );

    versionData = await this.contractManager.getVersionDetails(
      contractName,
      version
    );

    var receivedVersion = versionData[0];
    var receivedStatus = versionData[1].toNumber();
    var receivedbugLevel = versionData[2].toNumber();
    var receivedImplementation = versionData[3];

    assert.equal(
      receivedVersion,
      contractVersions[contractName][version].version,
      "Received version must match the passed one"
    );
    assert.equal(
      receivedStatus,
      contractVersions[contractName][version].status,
      "Received staus must be the one which was passed"
    );
    assert.equal(
      receivedbugLevel,
      contractVersions[contractName][version].bugLevel,
      "Received bug level must match"
    );
    assert.equal(
      receivedImplementation,
      contractVersions[contractName][version].implementation,
      "Received implementation must match the passed one"
    );
  };

  it("Add version v1.0 for escrow contract", async () => {
    var escrowVersion1_0 = await Escrow.new();
    var contractName = contracts[0];
    var version = versions[0][0];
    var status = 0;
    var _implementation = escrowVersion1_0.address;

    await addVersion(contractName, version, status, _implementation);
  });

  it("Add version v1.1 for escrow contract", async () => {
    var escrowVersion1_1 = await Escrow.new();
    var contractName = contracts[0];
    var version = versions[0][1];
    var status = 0;
    var _implementation = escrowVersion1_1.address;

    await addVersion(contractName, version, status, _implementation);
  });

  it("Add version v1.1 again for escrow contract", async () => {
    var escrowVersion1_1 = await Escrow.new();
    var contractName = contracts[0];
    var version = versions[0][1];
    var status = 0;
    var _implementation = escrowVersion1_1.address;

    try {
      await addVersion(contractName, version, status, _implementation);
      assert.equal(
        true,
        false,
        "Should not be able to add version with v1.1 as it is already registered"
      );
    } catch (error) {
      assert.notInclude(error.toString(), "AssertionError", error.message);
    }
  });

  it("Add version with empty contract name", async () => {
    var escrowVersion1_1 = await Escrow.new();
    var contractName = "";
    var version = versions[0][1];
    var status = 0;
    var _implementation = escrowVersion1_1.address;

    try {
      await addVersion(contractName, version, status, _implementation);
      assert.equal(
        true,
        false,
        "Should not be able to add version with empty contract name"
      );
    } catch (error) {
      assert.notInclude(error.toString(), "AssertionError", error.message);
    }
  });

  it("Add version with empty version name", async () => {
    var escrowVersion1_1 = await Escrow.new();
    var contractName = contracts[0];
    var version = "";
    var status = 0;
    var _implementation = escrowVersion1_1.address;

    try {
      await addVersion(contractName, version, status, _implementation);
      assert.equal(
        true,
        false,
        "Should not be able to version with empty version name"
      );
    } catch (error) {
      assert.notInclude(error.toString(), "AssertionError", error.message);
    }
  });

  it("Change status of version to PRODUCTION", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var status = 2; //PRODUCTION;
    var bugLevel = contractVersions[contractName][version].bugLevel;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change bug level of version to HIGH", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var bugLevel = 3; //HIGH;
    var status = contractVersions[contractName][version].status;

    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change bug level of version to NONE", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var bugLevel = 0; //NONE;
    var status = contractVersions[contractName][version].status;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Mark version as recommended", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];

    await markRecommended(contractName, version);
  });

  it("Change status of version to BETA", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var status = 0; //BETA;
    var bugLevel = contractVersions[contractName][version].bugLevel;

    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change status of version to RC", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var status = 1; //RC;
    var bugLevel = contractVersions[contractName][version].bugLevel;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change status of version to DEPRECATED", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var status = 3; //DEPRECATED;
    var bugLevel = contractVersions[contractName][version].bugLevel;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change bug level of version to LOW", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var bugLevel = 1; //LOW;
    var status = contractVersions[contractName][version].status;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change bug level of version to MEDIUM", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var bugLevel = 2; //MEDIUM;
    var status = contractVersions[contractName][version].status;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change bug level of version to CRITICAL", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var bugLevel = 4; //CRITICAL;
    var status = contractVersions[contractName][version].status;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Change bug level of version to NONE", async () => {
    var contractName = contracts[0];
    var version = versions[0][1];
    var bugLevel = 0; //NONE;
    var status = contractVersions[contractName][version].status;
    
    await updateVersion(contractName, version, status, bugLevel);
  });

  it("Remove recommended version", async () => {
    var contractName = contracts[0];

    await removeRecommendedVersion(contractName);
  });

  it("Add version with implementation address as non-contract address", async () => {
    var contractName = contracts[0];
    var version = "v1.2";
    var status = 0;
    var _implementation = accounts[7];

    try {
      await addVersion(contractName, version, status, _implementation);
      assert.equal(
        true,
        false,
        "Should not be able to add version with implementaion address as non-contract address"
      );
    } catch (error) {
      assert.notInclude(error.toString(), "AssertionError", error.message);
    }
  });

  it("Check total contract count", async () => {
    var count = await this.contractManager.getTotalContractCount();

    assert.equal(
      count.toNumber(),
      contracts.length,
      "Number of contracts does not match the contract registered"
    );
  });

  it("Check registered contracts", async () => {
    var count = await this.contractManager.getTotalContractCount();

    for (var i = 0; i < count.toNumber(); i++) {
      var contractName = await this.contractManager.getContractAtIndex(i);
      assert.equal(
        contracts[i],
        contractName,
        "Contract name must match the registered contract"
      );
    }
  });

  it("Check total count of versions for a contract", async () => {
    var count = await this.contractManager.getTotalContractCount();

    for (var i = 0; i < count.toNumber(); i++) {
      var contractName = await this.contractManager.getContractAtIndex(i);

      var versionCount = await this.contractManager.getVersionCountForContract(
        contractName
      );
      assert.equal(
        versionCount.toNumber(),
        Object.keys(contractVersions[contractName]).length,
        "Number of contracts versions does not match the versions registered for contract: "+ contractName
      );
    }
  });

  it("Check registered versions for a contract", async () => {
    var contractCount = await this.contractManager.getTotalContractCount();

    for (var i = 0; i < contractCount.toNumber(); i++) {
      var contractName = await this.contractManager.getContractAtIndex(i);

      var versionCount = await this.contractManager.getVersionCountForContract(
        contractName
      );

      for (var j = 0; j < versionCount.toNumber(); j++) {
        var versionName = await this.contractManager.getVersionAtIndex(
          contractName,
          j
        );

        var versionData = await this.contractManager.getVersionDetails(
          contractName,
          versionName
        );

        var receivedVersion = versionData[0];
        var receivedStatus = versionData[1].toNumber();
        var receivedbugLevel = versionData[2].toNumber();
        var receivedImplementation = versionData[3];

        assert.equal(
          receivedVersion,
          contractVersions[contractName][versionName].version,
          "Received version must match the passed one"
        );
        assert.equal(
          receivedStatus,
          contractVersions[contractName][versionName].status,
          "Received staus must be the one which was passed"
        );
        assert.equal(
          receivedbugLevel,
          contractVersions[contractName][versionName].bugLevel,
          "Received bug level must match"
        );
        assert.equal(
          receivedImplementation,
          contractVersions[contractName][versionName].implementation,
          "Received implementation must match the passed one"
        );
      }
    }
  });
});