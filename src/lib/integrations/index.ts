import { Provider } from './provider';
import { SleeperProvider } from './sleeper';
import { YahooProvider } from './yahoo';

export function getProvider(providerName: string): Provider {
  switch (providerName) {
    case 'sleeper':
      return new SleeperProvider();
    case 'yahoo':
      return new YahooProvider();
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}
