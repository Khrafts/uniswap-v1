pragma solidity ^0.8.0;

interface IFactory {
    function getExchange(address tokenAddress) external returns (address);
}
