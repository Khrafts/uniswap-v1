pragma solidity ^0.8.0;

interface IExchange {
    function ethToTokenTransfer(uint256 _minTokens, address _recipient)
        external
        payable;
}
