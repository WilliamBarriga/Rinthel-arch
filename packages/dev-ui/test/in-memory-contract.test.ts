import { inMemoryDev, testDevContract } from '../src/contract';

testDevContract(async (content) => inMemoryDev(content));
