import React, { Component } from 'react';
import {
  AsyncStorage,
} from 'react-native';

import { ApolloProvider } from 'react-apollo';
import { createStore, combineReducers, applyMiddleware } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import ApolloClient, { createNetworkInterface } from 'apollo-client';
import { SubscriptionClient, addGraphQLSubscriptions } from 'subscriptions-transport-ws';
import { persistStore, autoRehydrate } from 'redux-persist';
import thunk from 'redux-thunk';

import AppWithNavigationState, { navigationReducer } from './navigation';
import auth from './reducers/auth.reducer';

const networkInterface = createNetworkInterface({ uri: 'http://localhost:8080/graphql' });

// Create WebSocket client
const wsClient = new SubscriptionClient('ws://localhost:8080/subscriptions', {
  reconnect: true,
  connectionParams: {
    // Pass any arguments you want for initialization
  },
});

// Extend the network interface with the WebSocket
const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
  networkInterface,
  wsClient,
);

const client = new ApolloClient({
  networkInterface: networkInterfaceWithSubscriptions,
});

const store = createStore(
  combineReducers({
    apollo: client.reducer(),
    nav: navigationReducer,
    auth,
  }),
  {}, // initial state
  composeWithDevTools(
    applyMiddleware(client.middleware(), thunk),
    autoRehydrate(),
  ),
);

// persistent storage
persistStore(store, {
  storage: AsyncStorage,
  blacklist: ['apollo', 'nav'], // don't persist apollo or nav for now
});

export default class App extends Component {
  render() {
    return (
      <ApolloProvider store={store} client={client}>
        <AppWithNavigationState />
      </ApolloProvider>
    );
  }
}
