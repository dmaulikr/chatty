# Step 6: GraphQL Subscriptions

This is the fifth blog in a multipart series where we will be building Chatty, a WhatsApp clone, using [React Native](https://facebook.github.io/react-native/) and [Apollo](http://dev.apollodata.com/).

In this tutorial, we’ll focus on adding [GraphQL Subscriptions](http://graphql.org/blog/subscriptions-in-graphql-and-relay/), which will give our app real-time instant messaging capabilities!

Here’s what we will accomplish in this tutorial:
1. Introduce Event-based Subscriptions
2. Build server-side infrastructure to handle **GraphQL Subscriptions** via WebSockets
3. Design GraphQL Subscriptions and add them to our GraphQL Schemas and Resolvers
4. Build client-side infrastructure to handle GraphQL Subscriptions via WebSockets
5. Subscribe to GraphQL Subscriptions on our React Native client and handle real-time updates

# Event-based Subscriptions
Real-time capable apps need a way to be pushed data from the server. In some real-time architectures, all data is considered live data, and anytime data changes on the server, it’s pushed through a WebSocket or long-polling and updated on the client. While this sort of architecture means we can expect data to update on the client without writing extra code, it starts to get tricky and non-performant as apps scale. For one thing, you don’t need to keep track of every last bit of data if it’s not relevant to the user. Moreover, it’s not obvious what changes to data should trigger an event, what that event should look like, and how our clients should react.

With an event-based subscription model in GraphQL — much like with queries and mutations — a client can tell the server exactly what data it wants to be pushed and what that data should look like. This leads to fewer events tracked on the server and pushed to the client, and precise event handling on both ends!

# GraphQL Subscriptions on the Server
It’s probably easiest to think about our event based subscriptions setup from the client’s perspective. All queries and mutations will still get executed with standard HTTP requests. This will keep request execution more reliable and the WebSocket connection unclogged. We will only use WebSockets for subscriptions, and the client will only subscribe to events it cares about — the ones that affect stuff for the current user.

## Designing GraphQL Subscriptions
Let’s focus on the most important event that ever happens within a messaging app — getting a new message.

When someone creates a new message, we want all group members to be notified that a new message was created. We don’t want our users to know about every new message being created by everybody on Chatty, so we’ll create a system where users **subscribe** to new message events just for their own groups. We can build this subscription model right into our GraphQL Schema!

Let’s modify our GraphQL Schema in `server/data/schema.js` to include a **GraphQL Subscription** for when new messages are added to a group we care about:

[{]: <helper> (diffStep 6.1)

#### Step 6.1: Add Subscription to Schema

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -52,10 +52,17 @@
 ┊52┊52┊    leaveGroup(id: Int!, userId: Int!): Group # let user leave group
 ┊53┊53┊    updateGroup(id: Int!, name: String): Group
 ┊54┊54┊  }
+┊  ┊55┊
+┊  ┊56┊  type Subscription {
+┊  ┊57┊    # Subscription fires on every message added
+┊  ┊58┊    # for any of the groups with one of these groupIds
+┊  ┊59┊    messageAdded(groupIds: [Int]): Message
+┊  ┊60┊  }
 ┊55┊61┊  
 ┊56┊62┊  schema {
 ┊57┊63┊    query: Query
 ┊58┊64┊    mutation: Mutation
+┊  ┊65┊    subscription: Subscription
 ┊59┊66┊  }
 ┊60┊67┊`];
```

[}]: #

That’s it!

## GraphQL Subscription Infrastructure
Our Schema uses GraphQL Subscriptions, but our server infrastructure has no way to handle them.

We will use two excellent packages from the Apollo team  — [` subscription-transport-ws`](https://www.npmjs.com/package/subscriptions-transport-ws) and [`graphql-subscriptions`](https://www.npmjs.com/package/graphql-subscriptions)  —  to hook up our GraphQL server with subscription capabilities:
```
yarn add graphql-subscriptions subscriptions-transport-ws
```

First, we’ll use `graphql-subscriptions` to create a `PubSub` manager. `PubSub` is basically just event emitters wrapped with a function that filters messages. It can easily be replaced later with something more advanced like [`graphql-redis-subscriptions`](https://github.com/davidyaha/graphql-redis-subscriptions).

Let’s create a new file `server/subscriptions.js` where we’ll start fleshing out our subscription infrastructure:

[{]: <helper> (diffStep 6.2 files="server/subscriptions.js")

#### Step 6.2: Create subscriptions.js

##### Added server&#x2F;subscriptions.js
```diff
@@ -0,0 +1,5 @@
+┊ ┊1┊import { PubSub } from 'graphql-subscriptions';
+┊ ┊2┊
+┊ ┊3┊export const pubsub = new PubSub();
+┊ ┊4┊
+┊ ┊5┊export default pubsub;
```

[}]: #

We're going to need the same `executableSchema` we created in `server/index.js`, so let’s pull out executableSchema from `server/index.js` and put it inside `server/data/schema.js` so other files can use `executableSchema`.

[{]: <helper> (diffStep 6.3)

#### Step 6.3: Refactor schema.js to export executableSchema

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -1,3 +1,8 @@
+┊ ┊1┊import { addMockFunctionsToSchema, makeExecutableSchema } from 'graphql-tools';
+┊ ┊2┊
+┊ ┊3┊import { Mocks } from './mocks';
+┊ ┊4┊import { Resolvers } from './resolvers';
+┊ ┊5┊
 ┊1┊6┊export const Schema = [`
 ┊2┊7┊  # declare custom scalars
 ┊3┊8┊  scalar Date
```
```diff
@@ -66,4 +71,15 @@
 ┊66┊71┊  }
 ┊67┊72┊`];
 ┊68┊73┊
-┊69┊  ┊export default Schema;
+┊  ┊74┊export const executableSchema = makeExecutableSchema({
+┊  ┊75┊  typeDefs: Schema,
+┊  ┊76┊  resolvers: Resolvers,
+┊  ┊77┊});
+┊  ┊78┊
+┊  ┊79┊// addMockFunctionsToSchema({
+┊  ┊80┊//   schema: executableSchema,
+┊  ┊81┊//   mocks: Mocks,
+┊  ┊82┊//   preserveResolvers: true,
+┊  ┊83┊// });
+┊  ┊84┊
+┊  ┊85┊export default executableSchema;
```

##### Changed server&#x2F;index.js
```diff
@@ -1,29 +1,13 @@
 ┊ 1┊ 1┊import express from 'express';
 ┊ 2┊ 2┊import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
-┊ 3┊  ┊import { makeExecutableSchema, addMockFunctionsToSchema } from 'graphql-tools';
 ┊ 4┊ 3┊import bodyParser from 'body-parser';
 ┊ 5┊ 4┊import { createServer } from 'http';
 ┊ 6┊ 5┊
-┊ 7┊  ┊import { Resolvers } from './data/resolvers';
-┊ 8┊  ┊import { Schema } from './data/schema';
-┊ 9┊  ┊import { Mocks } from './data/mocks';
+┊  ┊ 6┊import { executableSchema } from './data/schema';
 ┊10┊ 7┊
 ┊11┊ 8┊const GRAPHQL_PORT = 8080;
 ┊12┊ 9┊const app = express();
 ┊13┊10┊
-┊14┊  ┊const executableSchema = makeExecutableSchema({
-┊15┊  ┊  typeDefs: Schema,
-┊16┊  ┊  resolvers: Resolvers,
-┊17┊  ┊});
-┊18┊  ┊
-┊19┊  ┊// we can comment out this code for mocking data
-┊20┊  ┊// we're using REAL DATA now!
-┊21┊  ┊// addMockFunctionsToSchema({
-┊22┊  ┊//   schema: executableSchema,
-┊23┊  ┊//   mocks: Mocks,
-┊24┊  ┊//   preserveResolvers: true,
-┊25┊  ┊// });
-┊26┊  ┊
 ┊27┊11┊// `context` must be an object and can't be undefined when using connectors
 ┊28┊12┊app.use('/graphql', bodyParser.json(), graphqlExpress({
 ┊29┊13┊  schema: executableSchema,
```

[}]: #

Now that we’ve created a `PubSub`, we can use this class to publish and subscribe to events as they occur in our Resolvers.

We can modify `server/data/resolvers.js` as follows:

[{]: <helper> (diffStep 6.4)

#### Step 6.4: Add Subscription to Resolvers

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -1,6 +1,9 @@
 ┊1┊1┊import GraphQLDate from 'graphql-date';
 ┊2┊2┊
 ┊3┊3┊import { Group, Message, User } from './connectors';
+┊ ┊4┊import { pubsub } from '../subscriptions';
+┊ ┊5┊
+┊ ┊6┊const MESSAGE_ADDED_TOPIC = 'messageAdded';
 ┊4┊7┊
 ┊5┊8┊export const Resolvers = {
 ┊6┊9┊  Date: GraphQLDate,
```
```diff
@@ -24,6 +27,10 @@
 ┊24┊27┊        userId,
 ┊25┊28┊        text,
 ┊26┊29┊        groupId,
+┊  ┊30┊      }).then((message) => {
+┊  ┊31┊        // publish subscription notification with the whole message
+┊  ┊32┊        pubsub.publish(MESSAGE_ADDED_TOPIC, { [MESSAGE_ADDED_TOPIC]: message });
+┊  ┊33┊        return message;
 ┊27┊34┊      });
 ┊28┊35┊    },
 ┊29┊36┊    createGroup(_, { name, userIds, userId }) {
```
```diff
@@ -59,6 +66,12 @@
 ┊59┊66┊        .then(group => group.update({ name }));
 ┊60┊67┊    },
 ┊61┊68┊  },
+┊  ┊69┊  Subscription: {
+┊  ┊70┊    messageAdded: {
+┊  ┊71┊      // the subscription payload is the message.
+┊  ┊72┊      subscribe: () => pubsub.asyncIterator(MESSAGE_ADDED_TOPIC),
+┊  ┊73┊    },
+┊  ┊74┊  },
 ┊62┊75┊  Group: {
 ┊63┊76┊    users(group) {
 ┊64┊77┊      return group.getUsers();
```

[}]: #

Whenever a user creates a message, we trigger `pubsub` to publish the `messageAdded` event along with the newly created message. `PubSub` will emit an event to any clients subscribed to `messageAdded` and pass them the new message.

But we only want to emit this event to clients who care about the message because it was sent to one of their user’s groups! We can modify our implementation to filter who gets the event emission:

[{]: <helper> (diffStep 6.5)

#### Step 6.5: Add withFilter to messageAdded

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -1,4 +1,5 @@
 ┊1┊1┊import GraphQLDate from 'graphql-date';
+┊ ┊2┊import { withFilter } from 'graphql-subscriptions';
 ┊2┊3┊
 ┊3┊4┊import { Group, Message, User } from './connectors';
 ┊4┊5┊import { pubsub } from '../subscriptions';
```
```diff
@@ -68,8 +69,12 @@
 ┊68┊69┊  },
 ┊69┊70┊  Subscription: {
 ┊70┊71┊    messageAdded: {
-┊71┊  ┊      // the subscription payload is the message.
-┊72┊  ┊      subscribe: () => pubsub.asyncIterator(MESSAGE_ADDED_TOPIC),
+┊  ┊72┊      subscribe: withFilter(
+┊  ┊73┊        () => pubsub.asyncIterator(MESSAGE_ADDED_TOPIC),
+┊  ┊74┊        (payload, args) => {
+┊  ┊75┊          return Boolean(args.groupIds && ~args.groupIds.indexOf(payload.messageAdded.groupId));
+┊  ┊76┊        },
+┊  ┊77┊      ),
 ┊73┊78┊    },
 ┊74┊79┊  },
 ┊75┊80┊  Group: {
```

[}]: #

Using `withFilter`, we create a `filter` which returns true when the `groupId` of a new message matches one of the `groupIds` passed into our `messageAdded` subscription. This filter will be applied whenever `pubsub.publish(MESSAGE_ADDED_TOPIC, { [MESSAGE_ADDED_TOPIC]: message })` is triggered, and only clients whose subscriptions pass the filter will receive the message.

Our Resolvers are all set up. Time to hook our server up to WebSockets!

## Creating the SubscriptionServer
Our server will serve subscriptions via WebSockets, keeping an open connection with clients. `subscription-transport-ws` exposes a `SubscriptionServer` module that, when given a server, an endpoint, and the `execute` and `subscribe` modules from `graphql`, will tie everything together. The `SubscriptionServer` will rely on the Resolvers to manage emitting events to subscribed clients over the endpoint via WebSockets. How cool is that?!

Inside `server/index.js`, let’s attach a new `SubscriptionServer` to our current server and have it use `ws://localhost:3000/subscriptions` (`SUBSCRIPTIONS_PATH`) as our subscription endpoint:

[{]: <helper> (diffStep 6.6)

#### Step 6.6: Create SubscriptionServer

##### Changed server&#x2F;index.js
```diff
@@ -2,10 +2,15 @@
 ┊ 2┊ 2┊import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
 ┊ 3┊ 3┊import bodyParser from 'body-parser';
 ┊ 4┊ 4┊import { createServer } from 'http';
+┊  ┊ 5┊import { SubscriptionServer } from 'subscriptions-transport-ws';
+┊  ┊ 6┊import { execute, subscribe } from 'graphql';
 ┊ 5┊ 7┊
 ┊ 6┊ 8┊import { executableSchema } from './data/schema';
 ┊ 7┊ 9┊
 ┊ 8┊10┊const GRAPHQL_PORT = 8080;
+┊  ┊11┊const GRAPHQL_PATH = '/graphql';
+┊  ┊12┊const SUBSCRIPTIONS_PATH = '/subscriptions';
+┊  ┊13┊
 ┊ 9┊14┊const app = express();
 ┊10┊15┊
 ┊11┊16┊// `context` must be an object and can't be undefined when using connectors
```
```diff
@@ -15,9 +20,23 @@
 ┊15┊20┊}));
 ┊16┊21┊
 ┊17┊22┊app.use('/graphiql', graphiqlExpress({
-┊18┊  ┊  endpointURL: '/graphql',
+┊  ┊23┊  endpointURL: GRAPHQL_PATH,
+┊  ┊24┊  subscriptionsEndpoint: `ws://localhost:${GRAPHQL_PORT}${SUBSCRIPTIONS_PATH}`,
 ┊19┊25┊}));
 ┊20┊26┊
 ┊21┊27┊const graphQLServer = createServer(app);
 ┊22┊28┊
-┊23┊  ┊graphQLServer.listen(GRAPHQL_PORT, () => console.log(`GraphQL Server is now running on http://localhost:${GRAPHQL_PORT}/graphql`));
+┊  ┊29┊graphQLServer.listen(GRAPHQL_PORT, () => {
+┊  ┊30┊  console.log(`GraphQL Server is now running on http://localhost:${GRAPHQL_PORT}${GRAPHQL_PATH}`);
+┊  ┊31┊  console.log(`GraphQL Subscriptions are now running on ws://localhost:${GRAPHQL_PORT}${SUBSCRIPTIONS_PATH}`);
+┊  ┊32┊});
+┊  ┊33┊
+┊  ┊34┊// eslint-disable-next-line no-unused-vars
+┊  ┊35┊const subscriptionServer = SubscriptionServer.create({
+┊  ┊36┊  schema: executableSchema,
+┊  ┊37┊  execute,
+┊  ┊38┊  subscribe,
+┊  ┊39┊}, {
+┊  ┊40┊  server: graphQLServer,
+┊  ┊41┊  path: SUBSCRIPTIONS_PATH,
+┊  ┊42┊});
```

[}]: #

You might have noticed that we also updated our `/graphiql` endpoint to include a subscriptionsEndpoint. That’s right  —  we can track our subscriptions in GraphIQL!

A GraphQL Subscription is written on the client much like a query or mutation. For example, in GraphIQL, we could write the following GraphQL Subscription for `messageAdded`:
```
subscription messageAdded($groupIds: [Int]){
  messageAdded(groupIds: $groupIds) {
    id
    to {
      name
    }
    from {
      username
    }
    text
  }
}
```

Let’s check out GraphIQL and see if everything works: ![GraphIQL Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step6-6.gif)

## New Subscription Workflow
We’ve successfully set up GraphQL Subscriptions on our server.

Since we have the infrastructure in place, let’s add one more subscription for some extra practice. We can use the same methodology we used for subscribing to new `Messages` and apply it to new `Groups`. After all, it’s important that our users know right away that they’ve been added to a new group.

The steps are as follows:
1. Add the subscription to our Schema:

[{]: <helper> (diffStep 6.7)

#### Step 6.7: Add groupAdded to Schema

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -62,6 +62,7 @@
 ┊62┊62┊    # Subscription fires on every message added
 ┊63┊63┊    # for any of the groups with one of these groupIds
 ┊64┊64┊    messageAdded(groupIds: [Int]): Message
+┊  ┊65┊    groupAdded(userId: Int): Group
 ┊65┊66┊  }
 ┊66┊67┊  
 ┊67┊68┊  schema {
```

[}]: #

2. Publish to the subscription when a new `Group` is created and resolve the subscription in the Resolvers:

[{]: <helper> (diffStep 6.8)

#### Step 6.8: Add groupAdded to Resolvers

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -5,6 +5,7 @@
 ┊ 5┊ 5┊import { pubsub } from '../subscriptions';
 ┊ 6┊ 6┊
 ┊ 7┊ 7┊const MESSAGE_ADDED_TOPIC = 'messageAdded';
+┊  ┊ 8┊const GROUP_ADDED_TOPIC = 'groupAdded';
 ┊ 8┊ 9┊
 ┊ 9┊10┊export const Resolvers = {
 ┊10┊11┊  Date: GraphQLDate,
```
```diff
@@ -42,8 +43,13 @@
 ┊42┊43┊            users: [user, ...friends],
 ┊43┊44┊          })
 ┊44┊45┊            .then(group => group.addUsers([user, ...friends])
-┊45┊  ┊              .then(() => group),
-┊46┊  ┊            ),
+┊  ┊46┊              .then((res) => {
+┊  ┊47┊                // append the user list to the group object
+┊  ┊48┊                // to pass to pubsub so we can check members
+┊  ┊49┊                group.users = [user, ...friends];
+┊  ┊50┊                pubsub.publish(GROUP_ADDED_TOPIC, { [GROUP_ADDED_TOPIC]: group });
+┊  ┊51┊                return group;
+┊  ┊52┊              })),
 ┊47┊53┊          ),
 ┊48┊54┊        );
 ┊49┊55┊    },
```
```diff
@@ -76,6 +82,9 @@
 ┊76┊82┊        },
 ┊77┊83┊      ),
 ┊78┊84┊    },
+┊  ┊85┊    groupAdded: {
+┊  ┊86┊      subscribe: () => pubsub.asyncIterator(GROUP_ADDED_TOPIC),
+┊  ┊87┊    },
 ┊79┊88┊  },
 ┊80┊89┊  Group: {
 ┊81┊90┊    users(group) {
```

[}]: #

3. Filter the recipients of the emitted new group with `withFilter`:

[{]: <helper> (diffStep 6.9)

#### Step 6.9: Add withFilter to groupAdded

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -1,5 +1,6 @@
 ┊1┊1┊import GraphQLDate from 'graphql-date';
 ┊2┊2┊import { withFilter } from 'graphql-subscriptions';
+┊ ┊3┊import { map } from 'lodash';
 ┊3┊4┊
 ┊4┊5┊import { Group, Message, User } from './connectors';
 ┊5┊6┊import { pubsub } from '../subscriptions';
```
```diff
@@ -83,7 +84,12 @@
 ┊83┊84┊      ),
 ┊84┊85┊    },
 ┊85┊86┊    groupAdded: {
-┊86┊  ┊      subscribe: () => pubsub.asyncIterator(GROUP_ADDED_TOPIC),
+┊  ┊87┊      subscribe: withFilter(
+┊  ┊88┊        () => pubsub.asyncIterator(GROUP_ADDED_TOPIC),
+┊  ┊89┊        (payload, args) => {
+┊  ┊90┊          return Boolean(args.userId && ~map(payload.groupAdded.users, 'id').indexOf(args.userId));
+┊  ┊91┊        },
+┊  ┊92┊      ),
 ┊87┊93┊    },
 ┊88┊94┊  },
 ┊89┊95┊  Group: {
```

[}]: #

All set!

# GraphQL Subscriptions on the Client
Time to add subscriptions inside our React Native client. We’ll start by adding `subscriptions-transport-ws` to our client:
```
# make sure you're adding the package in the client!!!
cd client
yarn add subscriptions-transport-ws
```

We’ll use `subscription-transport-ws` on the client to connect to our WebSocket endpoint and extend the `networkInterface` we pass into `ApolloClient` to handle subscriptions on the endpoint:

[{]: <helper> (diffStep "6.10" files="client/src/app.js")

#### Step 6.10: Add wsClient to networkInterface

##### Changed client&#x2F;src&#x2F;app.js
```diff
@@ -4,12 +4,28 @@
 ┊ 4┊ 4┊import { createStore, combineReducers, applyMiddleware } from 'redux';
 ┊ 5┊ 5┊import { composeWithDevTools } from 'redux-devtools-extension';
 ┊ 6┊ 6┊import ApolloClient, { createNetworkInterface } from 'apollo-client';
+┊  ┊ 7┊import { SubscriptionClient, addGraphQLSubscriptions } from 'subscriptions-transport-ws';
 ┊ 7┊ 8┊
 ┊ 8┊ 9┊import AppWithNavigationState, { navigationReducer } from './navigation';
 ┊ 9┊10┊
 ┊10┊11┊const networkInterface = createNetworkInterface({ uri: 'http://localhost:8080/graphql' });
-┊11┊  ┊const client = new ApolloClient({
+┊  ┊12┊
+┊  ┊13┊// Create WebSocket client
+┊  ┊14┊const wsClient = new SubscriptionClient('ws://localhost:8080/subscriptions', {
+┊  ┊15┊  reconnect: true,
+┊  ┊16┊  connectionParams: {
+┊  ┊17┊    // Pass any arguments you want for initialization
+┊  ┊18┊  },
+┊  ┊19┊});
+┊  ┊20┊
+┊  ┊21┊// Extend the network interface with the WebSocket
+┊  ┊22┊const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
 ┊12┊23┊  networkInterface,
+┊  ┊24┊  wsClient,
+┊  ┊25┊);
+┊  ┊26┊
+┊  ┊27┊const client = new ApolloClient({
+┊  ┊28┊  networkInterface: networkInterfaceWithSubscriptions,
 ┊13┊29┊});
 ┊14┊30┊
 ┊15┊31┊const store = createStore(
```

[}]: #

That’s it — we’re ready to start adding subscriptions!

# Designing GraphQL Subscriptions
Our GraphQL Subscriptions are going to be ridiculously easy to write now that we’ve had practice with queries and mutations. We’ll first write our `messageAdded` subscription in a new file `client/src/graphql/message-added.subscription.js`:

[{]: <helper> (diffStep 6.11)

#### Step 6.11: Create MESSAGE_ADDED_SUBSCRIPTION

##### Added client&#x2F;src&#x2F;graphql&#x2F;message-added.subscription.js
```diff
@@ -0,0 +1,14 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊import MESSAGE_FRAGMENT from './message.fragment';
+┊  ┊ 4┊
+┊  ┊ 5┊const MESSAGE_ADDED_SUBSCRIPTION = gql`
+┊  ┊ 6┊  subscription onMessageAdded($groupIds: [Int]){
+┊  ┊ 7┊    messageAdded(groupIds: $groupIds){
+┊  ┊ 8┊      ... MessageFragment
+┊  ┊ 9┊    }
+┊  ┊10┊  }
+┊  ┊11┊  ${MESSAGE_FRAGMENT}
+┊  ┊12┊`;
+┊  ┊13┊
+┊  ┊14┊export default MESSAGE_ADDED_SUBSCRIPTION;
```

[}]: #

I’ve retitled the subscription `onMessageAdded` to distinguish the name from the subscription itself.

The `groupAdded` component will look extremely similar:

[{]: <helper> (diffStep 6.12)

#### Step 6.12: Create GROUP_ADDED_SUBSCRIPTION

##### Added client&#x2F;src&#x2F;graphql&#x2F;group-added.subscription.js
```diff
@@ -0,0 +1,18 @@
+┊  ┊ 1┊import gql from 'graphql-tag';
+┊  ┊ 2┊
+┊  ┊ 3┊import MESSAGE_FRAGMENT from './message.fragment';
+┊  ┊ 4┊
+┊  ┊ 5┊const GROUP_ADDED_SUBSCRIPTION = gql`
+┊  ┊ 6┊  subscription onGroupAdded($userId: Int){
+┊  ┊ 7┊    groupAdded(userId: $userId){
+┊  ┊ 8┊      id
+┊  ┊ 9┊      name
+┊  ┊10┊      messages(limit: 1) {
+┊  ┊11┊        ... MessageFragment
+┊  ┊12┊      }
+┊  ┊13┊    }
+┊  ┊14┊  }
+┊  ┊15┊  ${MESSAGE_FRAGMENT}
+┊  ┊16┊`;
+┊  ┊17┊
+┊  ┊18┊export default GROUP_ADDED_SUBSCRIPTION;🚫↵
```

[}]: #

Our subscriptions are fired up and ready to go. We just need to add them to our UI/UX and we’re finished.

## Connecting Subscriptions to Components
Our final step is to connect our new subscriptions to our React Native components.

Let’s first apply `messageAdded` to the `Messages` component. When a user is looking at messages within a group thread, we want new messages to pop onto the thread as they’re created.

The `graphql` module in `react-apollo` exposes a `prop` function named `subscribeToMore` that can attach subscriptions to a component. Inside the `subscribeToMore` function, we pass the subscription, variables, and tell the component how to modify query data state with `updateQuery`.

Take a look at the updated code in our `Messages` component in `client/src/screens/messages.screen.js`:

[{]: <helper> (diffStep 6.13)

#### Step 6.13: Apply subscribeToMore to Messages

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -18,6 +18,7 @@
 ┊18┊18┊import MessageInput from '../components/message-input.component';
 ┊19┊19┊import GROUP_QUERY from '../graphql/group.query';
 ┊20┊20┊import CREATE_MESSAGE_MUTATION from '../graphql/create-message.mutation';
+┊  ┊21┊import MESSAGE_ADDED_SUBSCRIPTION from '../graphql/message-added.subscription';
 ┊21┊22┊
 ┊22┊23┊const styles = StyleSheet.create({
 ┊23┊24┊  container: {
```
```diff
@@ -100,6 +101,33 @@
 ┊100┊101┊        });
 ┊101┊102┊      }
 ┊102┊103┊
+┊   ┊104┊      // we don't resubscribe on changed props
+┊   ┊105┊      // because it never happens in our app
+┊   ┊106┊      if (!this.subscription) {
+┊   ┊107┊        this.subscription = nextProps.subscribeToMore({
+┊   ┊108┊          document: MESSAGE_ADDED_SUBSCRIPTION,
+┊   ┊109┊          variables: { groupIds: [nextProps.navigation.state.params.groupId] },
+┊   ┊110┊          updateQuery: (previousResult, { subscriptionData }) => {
+┊   ┊111┊            const newMessage = subscriptionData.data.messageAdded;
+┊   ┊112┊            // if it's our own mutation
+┊   ┊113┊            // we might get the subscription result
+┊   ┊114┊            // after the mutation result.
+┊   ┊115┊            if (isDuplicateMessage(
+┊   ┊116┊              newMessage, previousResult.group.messages)
+┊   ┊117┊            ) {
+┊   ┊118┊              return previousResult;
+┊   ┊119┊            }
+┊   ┊120┊            return update(previousResult, {
+┊   ┊121┊              group: {
+┊   ┊122┊                messages: {
+┊   ┊123┊                  $unshift: [newMessage],
+┊   ┊124┊                },
+┊   ┊125┊              },
+┊   ┊126┊            });
+┊   ┊127┊          },
+┊   ┊128┊        });
+┊   ┊129┊      }
+┊   ┊130┊
 ┊103┊131┊      this.setState({
 ┊104┊132┊        usernameColors,
 ┊105┊133┊      });
```
```diff
@@ -181,6 +209,7 @@
 ┊181┊209┊  loading: PropTypes.bool,
 ┊182┊210┊  loadMoreEntries: PropTypes.func,
 ┊183┊211┊  networkStatus: PropTypes.number,
+┊   ┊212┊  subscribeToMore: PropTypes.func,
 ┊184┊213┊};
 ┊185┊214┊
 ┊186┊215┊const ITEMS_PER_PAGE = 10;
```
```diff
@@ -192,10 +221,11 @@
 ┊192┊221┊      limit: ITEMS_PER_PAGE,
 ┊193┊222┊    },
 ┊194┊223┊  }),
-┊195┊   ┊  props: ({ data: { fetchMore, loading, group, networkStatus } }) => ({
+┊   ┊224┊  props: ({ data: { fetchMore, loading, group, networkStatus, subscribeToMore } }) => ({
 ┊196┊225┊    loading,
 ┊197┊226┊    group,
 ┊198┊227┊    networkStatus,
+┊   ┊228┊    subscribeToMore,
 ┊199┊229┊    loadMoreEntries() {
 ┊200┊230┊      return fetchMore({
 ┊201┊231┊        // query: ... (you can specify a different query.
```

[}]: #

After we connect `subscribeToMore` to the component’s props, we attach a subscription property on the component (so there’s only one) which initializes `subscribeToMore` with the required parameters. Inside `updateQuery`, when we receive a new message, we make sure its not a duplicate, and then unshift the message onto our collection of messages.

Does it work?! ![Working Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step6-13.gif)

We need to subscribe to new Groups and Messages so our Groups component will update in real time. The Groups component needs to subscribe to `groupAdded` and `messageAdded` because in addition to new groups popping up when they’re created, the latest messages should also show up in each group’s preview. 

However, instead of using `subscribeToMore` in our Groups screen, we should actually consider applying these subscriptions to a higher order component (HOC) for our application. If we navigate away from the Groups screen at any point, we will unsubscribe and won't receive real-time updates while we're away from the screen. We'd need to refetch queries from the network when returning to the Groups screen to guarantee that our data is up to date. 

If we attach our subscription to a higher order component, like `AppWithNavigationState`, we can stay subscribed to the subscriptions no matter where the user navigates and always keep our state up to date in real time! 

Let's apply the `USER_QUERY` to `AppWithNavigationState` in `client/src/navigation.js` and include two subscriptions using `subscribeToMore` for new `Messages` and `Groups`:

[{]: <helper> (diffStep 6.14)

#### Step 6.14: Apply subscribeToMore to AppWithNavigationState

##### Changed client&#x2F;src&#x2F;navigation.js
```diff
@@ -1,8 +1,11 @@
 ┊ 1┊ 1┊import PropTypes from 'prop-types';
-┊ 2┊  ┊import React from 'react';
+┊  ┊ 2┊import React, { Component } from 'react';
 ┊ 3┊ 3┊import { addNavigationHelpers, StackNavigator, TabNavigator } from 'react-navigation';
 ┊ 4┊ 4┊import { Text, View, StyleSheet } from 'react-native';
 ┊ 5┊ 5┊import { connect } from 'react-redux';
+┊  ┊ 6┊import { graphql, compose } from 'react-apollo';
+┊  ┊ 7┊import update from 'immutability-helper';
+┊  ┊ 8┊import { map } from 'lodash';
 ┊ 6┊ 9┊
 ┊ 7┊10┊import Groups from './screens/groups.screen';
 ┊ 8┊11┊import Messages from './screens/messages.screen';
```
```diff
@@ -10,6 +13,17 @@
 ┊10┊13┊import GroupDetails from './screens/group-details.screen';
 ┊11┊14┊import NewGroup from './screens/new-group.screen';
 ┊12┊15┊
+┊  ┊16┊import { USER_QUERY } from './graphql/user.query';
+┊  ┊17┊import MESSAGE_ADDED_SUBSCRIPTION from './graphql/message-added.subscription';
+┊  ┊18┊import GROUP_ADDED_SUBSCRIPTION from './graphql/group-added.subscription';
+┊  ┊19┊
+┊  ┊20┊// helper function checks for duplicate documents
+┊  ┊21┊// TODO: it's pretty inefficient to scan all the documents every time.
+┊  ┊22┊// maybe only scan the first 10, or up to a certain timestamp
+┊  ┊23┊function isDuplicateDocument(newDocument, existingDocuments) {
+┊  ┊24┊  return newDocument.id !== null && existingDocuments.some(doc => newDocument.id === doc.id);
+┊  ┊25┊}
+┊  ┊26┊
 ┊13┊27┊const styles = StyleSheet.create({
 ┊14┊28┊  container: {
 ┊15┊29┊    flex: 1,
```
```diff
@@ -71,17 +85,124 @@
 ┊ 71┊ 85┊  return nextState || state;
 ┊ 72┊ 86┊};
 ┊ 73┊ 87┊
-┊ 74┊   ┊const AppWithNavigationState = ({ dispatch, nav }) => (
-┊ 75┊   ┊  <AppNavigator navigation={addNavigationHelpers({ dispatch, state: nav })} />
-┊ 76┊   ┊);
+┊   ┊ 88┊class AppWithNavigationState extends Component {
+┊   ┊ 89┊  componentWillReceiveProps(nextProps) {
+┊   ┊ 90┊    if (!nextProps.user) {
+┊   ┊ 91┊      if (this.groupSubscription) {
+┊   ┊ 92┊        this.groupSubscription();
+┊   ┊ 93┊      }
+┊   ┊ 94┊
+┊   ┊ 95┊      if (this.messagesSubscription) {
+┊   ┊ 96┊        this.messagesSubscription();
+┊   ┊ 97┊      }
+┊   ┊ 98┊    }
+┊   ┊ 99┊
+┊   ┊100┊    if (nextProps.user &&
+┊   ┊101┊      (!this.props.user || nextProps.user.groups.length !== this.props.user.groups.length)) {
+┊   ┊102┊      // unsubscribe from old
+┊   ┊103┊
+┊   ┊104┊      if (typeof this.messagesSubscription === 'function') {
+┊   ┊105┊        this.messagesSubscription();
+┊   ┊106┊      }
+┊   ┊107┊      // subscribe to new
+┊   ┊108┊      if (nextProps.user.groups.length) {
+┊   ┊109┊        this.messagesSubscription = nextProps.subscribeToMessages();
+┊   ┊110┊      }
+┊   ┊111┊    }
+┊   ┊112┊
+┊   ┊113┊    if (!this.groupSubscription && nextProps.user) {
+┊   ┊114┊      this.groupSubscription = nextProps.subscribeToGroups();
+┊   ┊115┊    }
+┊   ┊116┊  }
+┊   ┊117┊
+┊   ┊118┊  render() {
+┊   ┊119┊    const { dispatch, nav } = this.props;
+┊   ┊120┊    return <AppNavigator navigation={addNavigationHelpers({ dispatch, state: nav })} />;
+┊   ┊121┊  }
+┊   ┊122┊}
 ┊ 77┊123┊
 ┊ 78┊124┊AppWithNavigationState.propTypes = {
 ┊ 79┊125┊  dispatch: PropTypes.func.isRequired,
 ┊ 80┊126┊  nav: PropTypes.object.isRequired,
+┊   ┊127┊  subscribeToGroups: PropTypes.func,
+┊   ┊128┊  subscribeToMessages: PropTypes.func,
+┊   ┊129┊  user: PropTypes.shape({
+┊   ┊130┊    id: PropTypes.number.isRequired,
+┊   ┊131┊    email: PropTypes.string.isRequired,
+┊   ┊132┊    groups: PropTypes.arrayOf(
+┊   ┊133┊      PropTypes.shape({
+┊   ┊134┊        id: PropTypes.number.isRequired,
+┊   ┊135┊        name: PropTypes.string.isRequired,
+┊   ┊136┊      }),
+┊   ┊137┊    ),
+┊   ┊138┊  }),
 ┊ 81┊139┊};
 ┊ 82┊140┊
 ┊ 83┊141┊const mapStateToProps = state => ({
 ┊ 84┊142┊  nav: state.nav,
 ┊ 85┊143┊});
 ┊ 86┊144┊
-┊ 87┊   ┊export default connect(mapStateToProps)(AppWithNavigationState);
+┊   ┊145┊const userQuery = graphql(USER_QUERY, {
+┊   ┊146┊  options: () => ({ variables: { id: 1 } }), // fake the user for now
+┊   ┊147┊  props: ({ data: { loading, user, subscribeToMore } }) => ({
+┊   ┊148┊    loading,
+┊   ┊149┊    user,
+┊   ┊150┊    subscribeToMessages() {
+┊   ┊151┊      return subscribeToMore({
+┊   ┊152┊        document: MESSAGE_ADDED_SUBSCRIPTION,
+┊   ┊153┊        variables: { groupIds: map(user.groups, 'id') },
+┊   ┊154┊        updateQuery: (previousResult, { subscriptionData }) => {
+┊   ┊155┊          const previousGroups = previousResult.user.groups;
+┊   ┊156┊          const newMessage = subscriptionData.data.messageAdded;
+┊   ┊157┊
+┊   ┊158┊          const groupIndex = map(previousGroups, 'id').indexOf(newMessage.to.id);
+┊   ┊159┊
+┊   ┊160┊          // if it's our own mutation
+┊   ┊161┊          // we might get the subscription result
+┊   ┊162┊          // after the mutation result.
+┊   ┊163┊          if (isDuplicateDocument(newMessage, previousGroups[groupIndex].messages)) {
+┊   ┊164┊            return previousResult;
+┊   ┊165┊          }
+┊   ┊166┊
+┊   ┊167┊          return update(previousResult, {
+┊   ┊168┊            user: {
+┊   ┊169┊              groups: {
+┊   ┊170┊                [groupIndex]: {
+┊   ┊171┊                  messages: { $set: [newMessage] },
+┊   ┊172┊                },
+┊   ┊173┊              },
+┊   ┊174┊            },
+┊   ┊175┊          });
+┊   ┊176┊        },
+┊   ┊177┊      });
+┊   ┊178┊    },
+┊   ┊179┊    subscribeToGroups() {
+┊   ┊180┊      return subscribeToMore({
+┊   ┊181┊        document: GROUP_ADDED_SUBSCRIPTION,
+┊   ┊182┊        variables: { userId: user.id },
+┊   ┊183┊        updateQuery: (previousResult, { subscriptionData }) => {
+┊   ┊184┊          const previousGroups = previousResult.user.groups;
+┊   ┊185┊          const newGroup = subscriptionData.data.groupAdded;
+┊   ┊186┊
+┊   ┊187┊          // if it's our own mutation
+┊   ┊188┊          // we might get the subscription result
+┊   ┊189┊          // after the mutation result.
+┊   ┊190┊          if (isDuplicateDocument(newGroup, previousGroups)) {
+┊   ┊191┊            return previousResult;
+┊   ┊192┊          }
+┊   ┊193┊
+┊   ┊194┊          return update(previousResult, {
+┊   ┊195┊            user: {
+┊   ┊196┊              groups: { $push: [newGroup] },
+┊   ┊197┊            },
+┊   ┊198┊          });
+┊   ┊199┊        },
+┊   ┊200┊      });
+┊   ┊201┊    },
+┊   ┊202┊  }),
+┊   ┊203┊});
+┊   ┊204┊
+┊   ┊205┊export default compose(
+┊   ┊206┊  connect(mapStateToProps),
+┊   ┊207┊  userQuery,
+┊   ┊208┊)(AppWithNavigationState);
```

##### Changed client&#x2F;src&#x2F;screens&#x2F;groups.screen.js
```diff
@@ -186,7 +186,7 @@
 ┊186┊186┊    const { loading, user, networkStatus } = this.props;
 ┊187┊187┊
 ┊188┊188┊    // render loading placeholder while we fetch messages
-┊189┊   ┊    if (loading) {
+┊   ┊189┊    if (loading || !user) {
 ┊190┊190┊      return (
 ┊191┊191┊        <View style={[styles.loading, styles.container]}>
 ┊192┊192┊          <ActivityIndicator />
```

[}]: #

We have to do a little extra work to guarantee that our `messageSubscription` updates when we add or remove new groups. Otherwise, if a new group is created and someone sends a message, the user won’t be subscribed to receive that new message. When we need to update the subscription, we unsubscribe by calling the subscription as a function `messageSubscription()` and then reset `messageSubscription` to reflect the latest `nextProps.subscribeToMessages`.

One of the cooler things about Apollo is it caches all the queries and data that we've fetched and reuses data for the same query in the future instead of requesting it from the network (unless we specify otherwise). `USER_QUERY` will  make a request to the network and then data will be reused for subsequent executions. Our app setup tracks any data changes with subscriptions, so we only end up requesting the data we need from the server once!

Final product: ![Final Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step6-14.gif)
[{]: <helper> (navStep)

| [< Previous Step](step10.md) |
|:----------------------|

[}]: #
