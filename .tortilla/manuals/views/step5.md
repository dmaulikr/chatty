# Step 5: GraphQL Pagination

This is the fifth blog in a multipart series where we will be building Chatty, a WhatsApp clone, using [React Native](https://facebook.github.io/react-native/) and [Apollo](http://dev.apollodata.com/).

In this tutorial, we’ll take a brief look at how to paginate data with GraphQL. By progressively loading data instead of getting it all at once, we can greatly improve the performance of our app.

Here’s what we will accomplish in this tutorial:
1. Overview different pagination strategies
2. Identify the best pagination strategy to apply to Chatty
3. Incorporate pagination in the Schema and Resolvers on our server
4. Incorporate pagination in the queries and layout of our React Native client

# Pagination Strategies
Let’s look at 3 common strategies for pagination and their primary advantages and disadvantages:
1. Page Numbering
2. Cursors
3. Relay Cursor Connections
For a more in-depth reading on pagination strategies and when and how to use them, I highly suggest checking out [Understanding pagination: REST, GraphQL, and Relay](https://dev-blog.apollodata.com/understanding-pagination-rest-graphql-and-relay-b10f835549e7), by [Sashko Stubailo](https://medium.com/@stubailo).

## Page Numbering
Think the o’s in Goooooogle search results. Page numbering in its naive form is super easy to implement in SQL with `limit` and `offset`:
```
// load the 4th page of messages
SELECT * FROM messages ORDER BY created_at DESC LIMIT 100 OFFSET 300;
```
Page numbering’s strength is in its simplicity. It’s a great strategy for dealing with static content or ordered content that won’t likely change duration a user session.

Page numbering’s weakness is dealing with dynamic data. When items are added or removed from our dataset, we can end up skipping an element or showing the same element twice. For example, if we added a new element to our data set that belongs first in the paginated results, navigating to the next page will show the last element on the current page for a second time. Similarly, if the first element gets deleted, navigating to the next page would skip what would have been the first element on the new page.

However, if our paginated results are ordered by newest element and elements aren’t deletable, page numbering can be a great option for paginating our data, especially for infinite scrollers. *wink*

## Cursors
Cursors look to solve the very problem page numbering presents. Cursors are a lot like a bookmark — we can stick it where we left off, and even if we shove more papers randomly into our book and tear a bunch out, we can still find where we last left off.

Let’s say we’re trying to show a paginated list of books ordered by title. With the cursor $after which is the title of the last book shown on the current page, we could get the next page of results in SQL as follows:
```
SELECT * FROM books
WHERE title > $after
ORDER BY title LIMIT $page_size;
```
In GraphQL, we would need our query response to include cursors:
```
booksByTitle(after: "Moby Dick", pageSize: 10) {
  cursors {
    after
  }
  books {
    title
    author {   
      firstName
      lastName
    }
  }
}
```
Cursors solve the challenges afflicting page numbering, but we can do even better! In this model, the only way for our client to know it’s on the last page is if we sent an extra request for more entries and received an empty response. Moreover, we can imagine more complicated scenarios where we would want to know the cursor for any given element in our results, not just the first or last one. We also should really strive to conform to a standardized response for any paginated query rather than making new ones up as we go. Enter, Relay Cursor Connections.

## Relay Cursor Connections
[Relay Cursor Connections](http://relay%20cursor%20connections%20specification/) specify a standardized GraphQL Query response for paginated data. In our previous `booksByTitle` example, it would look like this:
```
booksByTitle(first:10 after:"Moby Dick") {
  edges {
    node {
      title
        author {
          firstName
          lastName
        }
      }
      cursor
    }
  }
  pageInfo {
    hasPreviousPage
    hasNextPage
  }
}
```
In a nutshell, the shape of the response — the [“connection object”](http://graphql.org/learn/pagination/#end-of-list-counts-and-connections)  —  holds two elements: `edges` and `pageInfo`.

Each edge contains a `node` which is the element itself — in our case the book — and a `cursor`, which represents the cursor for the node element. Ideally, a cursor should be a **serializable opaque** cursor, meaning we shouldn’t have to worry about its formatting for pagination to work. So to match the spec, our `booksByTitle` query should look more like this:
```
booksByTitle(first:10 after:"TW9ieSBEaWNr") {
  ...
}
```
Where “Moby Dick” has been base-64 encoded. Our cursor based pagination should work just fine so long as we can reliably serialize, encode, and decode our cursor.

The other half of the connection object is pageInfo. pageInfo holds just two Booleans `hasPreviousPage` and `hasNextPage` that specify exactly what you’d expect — whether a previous page or next page is available.

With this connection object, we can execute a new query from any cursor with however many elements we want returned. We’ll save extra trips to the server when we’ve hit the beginning or end of a page. We also now have a standardized way of writing any paginated query. Sweet!

Really the biggest downside to Relay Cursor Connections is the amount of code and energy it takes to execute. We might also take a small hit in performance versus the other strategies as the resolver does a bit more work per element and the response is a little larger.

# Pagination on the Server
Time to add pagination to Chatty!

First, let’s identify some places where pagination makes sense.

There is no doubt pagination is sorely needed for displaying messages in a group. If we showed every last message in a group thread off the bat, things would get ugly quickly. We can also use pagination to preview the most recent message for a group before a user taps into the group thread.

I can’t imagine there are going to be many occasions where a user would belong to hundreds of groups, so let’s hold off on paginating groups until we have good reason.

What about a user’s friends? Pagination here can get a bit dicier, but I’m going to make the executive call and say **not today** — this is a nice-to-have feature but it’s not need-to-have. Most people don’t have a ton of contacts. Even if the call gets a bit expensive, it likely wont be *that* expensive, certainly not until Chatty has hundreds of thousands of users. Maybe we’ll implement this in a future tutorial :)

I thought about taking us down the Relay Cursor Connections rabbit hole, but for our purposes, it’s pretty clear which strategy makes the most sense: **page numbering**. Why make things difficult? Our messages will always be ordered by most recent, and we’re not planning on making them deletable anytime soon. WhatsApp just added the ability to edit and delete posts, and they’ve been around for 8 years. Really, most cases for pagination can be covered with page numbering. And when we add event subscriptions next tutorial, you’ll see that even when data is constantly getting added and deleted, we can still use page numbering without running into issues.
Let’s code it up!

When we request messages for a given group, we don’t use the `messages` query, we use `group`. Since we currently only request `Messages` within the context of a `Group`, we can update our Schema in `server/data/schema.js` accordingly:

[{]: <helper> (diffStep 5.1)

#### Step 5.1: Update Schema with Page Numbering

##### Changed server&#x2F;data&#x2F;schema.js
```diff
@@ -7,7 +7,7 @@
 ┊ 7┊ 7┊    id: Int! # unique id for the group
 ┊ 8┊ 8┊    name: String # name of the group
 ┊ 9┊ 9┊    users: [User]! # users in the group
-┊10┊  ┊    messages: [Message] # messages sent to the group
+┊  ┊10┊    messages(limit: Int, offset: Int): [Message] # messages sent to the group
 ┊11┊11┊  }
 ┊12┊12┊
 ┊13┊13┊  # a user -- keep type really simple for now
```

[}]: #

Now instead of asking for all messages when we query for a group or groups, we will specify the `limit` and `offset`. We just need to update our resolvers in `server/data/resolvers.js` to meet the spec:

[{]: <helper> (diffStep 5.2)

#### Step 5.2: Update Resolvers with Page Numbering

##### Changed server&#x2F;data&#x2F;resolvers.js
```diff
@@ -63,10 +63,12 @@
 ┊63┊63┊    users(group) {
 ┊64┊64┊      return group.getUsers();
 ┊65┊65┊    },
-┊66┊  ┊    messages(group) {
+┊  ┊66┊    messages(group, args) {
 ┊67┊67┊      return Message.findAll({
 ┊68┊68┊        where: { groupId: group.id },
 ┊69┊69┊        order: [['createdAt', 'DESC']],
+┊  ┊70┊        limit: args.limit,
+┊  ┊71┊        offset: args.offset,
 ┊70┊72┊      });
 ┊71┊73┊    },
 ┊72┊74┊  },
```

[}]: #

A quick test in GraphIQL shows everything is looking good: ![GraphIQL Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step5-2.png)

# Pagination in React Native
We’re going to update our React Native client to paginate messages with an infinite scroller when viewing a group thread.

`FlatList` has a function [`onEndReached`](https://facebook.github.io/react-native/docs/flatlist.html#onendreached) that will trigger when the user has scrolled close to the end of the list (we can set how close is needed to trigger the function via `onEndReachedThreshold`). However, messaging apps like ours typically display newest messages at the bottom of the list, which means we load older data at the top. This is the reverse of how most lists operate, so we need to modify our `FlatList` to be flipped so `onEndReached` triggers when we're approaching the top of the list, not the bottom. We can use [`react-native-reversed-flat-list`](https://github.com/jevakallio/react-native-reversed-flat-list) which flips the display of the list with a nifty trick just using CSS.

```
yarn add react-native-reversed-flat-list
```

[{]: <helper> (diffStep 5.3 files="client/src/screens/messages.screen.js")

#### Step 5.3: Use ReverseFlatList for Messages

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -1,6 +1,5 @@
 ┊1┊1┊import {
 ┊2┊2┊  ActivityIndicator,
-┊3┊ ┊  FlatList,
 ┊4┊3┊  Image,
 ┊5┊4┊  KeyboardAvoidingView,
 ┊6┊5┊  StyleSheet,
```
```diff
@@ -12,6 +11,7 @@
 ┊12┊11┊import React, { Component } from 'react';
 ┊13┊12┊import randomColor from 'randomcolor';
 ┊14┊13┊import { graphql, compose } from 'react-apollo';
+┊  ┊14┊import ReversedFlatList from 'react-native-reversed-flat-list';
 ┊15┊15┊
 ┊16┊16┊import Message from '../components/message.component';
 ┊17┊17┊import MessageInput from '../components/message-input.component';
```
```diff
@@ -82,10 +82,12 @@
 ┊82┊82┊    super(props);
 ┊83┊83┊    this.state = {
 ┊84┊84┊      usernameColors: {},
+┊  ┊85┊      refreshing: false,
 ┊85┊86┊    };
 ┊86┊87┊
 ┊87┊88┊    this.renderItem = this.renderItem.bind(this);
 ┊88┊89┊    this.send = this.send.bind(this);
+┊  ┊90┊    this.onEndReached = this.onEndReached.bind(this);
 ┊89┊91┊  }
 ┊90┊92┊
 ┊91┊93┊  componentWillReceiveProps(nextProps) {
```
```diff
@@ -105,13 +107,17 @@
 ┊105┊107┊    }
 ┊106┊108┊  }
 ┊107┊109┊
+┊   ┊110┊  onEndReached() {
+┊   ┊111┊    console.log('TODO: onEndReached');
+┊   ┊112┊  }
+┊   ┊113┊
 ┊108┊114┊  send(text) {
 ┊109┊115┊    this.props.createMessage({
 ┊110┊116┊      groupId: this.props.navigation.state.params.groupId,
 ┊111┊117┊      userId: 1, // faking the user for now
 ┊112┊118┊      text,
 ┊113┊119┊    }).then(() => {
-┊114┊   ┊      this.flatList.scrollToEnd({ animated: true });
+┊   ┊120┊      this.flatList.scrollToBottom({ animated: true });
 ┊115┊121┊    });
 ┊116┊122┊  }
 ┊117┊123┊
```
```diff
@@ -145,11 +151,12 @@
 ┊145┊151┊        keyboardVerticalOffset={64}
 ┊146┊152┊        style={styles.container}
 ┊147┊153┊      >
-┊148┊   ┊        <FlatList
+┊   ┊154┊        <ReversedFlatList
 ┊149┊155┊          ref={(ref) => { this.flatList = ref; }}
 ┊150┊156┊          data={group.messages.slice().reverse()}
 ┊151┊157┊          keyExtractor={this.keyExtractor}
 ┊152┊158┊          renderItem={this.renderItem}
+┊   ┊159┊          onEndReached={this.onEndReached}
 ┊153┊160┊        />
 ┊154┊161┊        <MessageInput send={this.send} />
 ┊155┊162┊      </KeyboardAvoidingView>
```

[}]: #

Now let’s update `GROUP_QUERY` in `client/src/graphql/group.query.js` to match our latest schema:

[{]: <helper> (diffStep 5.4)

#### Step 5.4: Update Group Query with Page Numbering

##### Changed client&#x2F;src&#x2F;graphql&#x2F;group.query.js
```diff
@@ -3,7 +3,7 @@
 ┊3┊3┊import MESSAGE_FRAGMENT from './message.fragment';
 ┊4┊4┊
 ┊5┊5┊const GROUP_QUERY = gql`
-┊6┊ ┊  query group($groupId: Int!) {
+┊ ┊6┊  query group($groupId: Int!, $limit: Int, $offset: Int) {
 ┊7┊7┊    group(id: $groupId) {
 ┊8┊8┊      id
 ┊9┊9┊      name
```
```diff
@@ -11,7 +11,7 @@
 ┊11┊11┊        id
 ┊12┊12┊        username
 ┊13┊13┊      }
-┊14┊  ┊      messages {
+┊  ┊14┊      messages(limit: $limit, offset: $offset) {
 ┊15┊15┊        ... MessageFragment
 ┊16┊16┊      }
 ┊17┊17┊    }
```

[}]: #

We now have the ability to pass `limit` and `offset` variables into the `group` query called by our `Messages` component.

We need to specify how `group` should look on a first run, and how to load more entries using the same query. The `graphql` module of `react-apollo` exposes a [`fetchMore`](http://dev.apollodata.com/react/pagination.html#fetch-more) function on the data prop where we can define how to update our query and our data:

[{]: <helper> (diffStep 5.5)

#### Step 5.5: Add fetchMore to groupQuery

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -12,6 +12,7 @@
 ┊12┊12┊import randomColor from 'randomcolor';
 ┊13┊13┊import { graphql, compose } from 'react-apollo';
 ┊14┊14┊import ReversedFlatList from 'react-native-reversed-flat-list';
+┊  ┊15┊import update from 'immutability-helper';
 ┊15┊16┊
 ┊16┊17┊import Message from '../components/message.component';
 ┊17┊18┊import MessageInput from '../components/message-input.component';
```
```diff
@@ -181,14 +182,39 @@
 ┊181┊182┊  loading: PropTypes.bool,
 ┊182┊183┊};
 ┊183┊184┊
+┊   ┊185┊const ITEMS_PER_PAGE = 10;
 ┊184┊186┊const groupQuery = graphql(GROUP_QUERY, {
 ┊185┊187┊  options: ownProps => ({
 ┊186┊188┊    variables: {
 ┊187┊189┊      groupId: ownProps.navigation.state.params.groupId,
+┊   ┊190┊      offset: 0,
+┊   ┊191┊      limit: ITEMS_PER_PAGE,
 ┊188┊192┊    },
 ┊189┊193┊  }),
-┊190┊   ┊  props: ({ data: { loading, group } }) => ({
-┊191┊   ┊    loading, group,
+┊   ┊194┊  props: ({ data: { fetchMore, loading, group } }) => ({
+┊   ┊195┊    loading,
+┊   ┊196┊    group,
+┊   ┊197┊    loadMoreEntries() {
+┊   ┊198┊      return fetchMore({
+┊   ┊199┊        // query: ... (you can specify a different query.
+┊   ┊200┊        // GROUP_QUERY is used by default)
+┊   ┊201┊        variables: {
+┊   ┊202┊          // We are able to figure out offset because it matches
+┊   ┊203┊          // the current messages length
+┊   ┊204┊          offset: group.messages.length,
+┊   ┊205┊        },
+┊   ┊206┊        updateQuery: (previousResult, { fetchMoreResult }) => {
+┊   ┊207┊          // we will make an extra call to check if no more entries
+┊   ┊208┊          if (!fetchMoreResult) { return previousResult; }
+┊   ┊209┊          // push results (older messages) to end of messages list
+┊   ┊210┊          return update(previousResult, {
+┊   ┊211┊            group: {
+┊   ┊212┊              messages: { $push: fetchMoreResult.group.messages },
+┊   ┊213┊            },
+┊   ┊214┊          });
+┊   ┊215┊        },
+┊   ┊216┊      });
+┊   ┊217┊    },
 ┊192┊218┊  }),
 ┊193┊219┊});
 ┊194┊220┊
```
```diff
@@ -221,6 +247,8 @@
 ┊221┊247┊            query: GROUP_QUERY,
 ┊222┊248┊            variables: {
 ┊223┊249┊              groupId,
+┊   ┊250┊              offset: 0,
+┊   ┊251┊              limit: ITEMS_PER_PAGE,
 ┊224┊252┊            },
 ┊225┊253┊          });
 ┊226┊254┊
```
```diff
@@ -236,6 +264,8 @@
 ┊236┊264┊            query: GROUP_QUERY,
 ┊237┊265┊            variables: {
 ┊238┊266┊              groupId,
+┊   ┊267┊              offset: 0,
+┊   ┊268┊              limit: ITEMS_PER_PAGE,
 ┊239┊269┊            },
 ┊240┊270┊            data,
 ┊241┊271┊          });
```

[}]: #

We’ve specified `limit: 10` and `offset: 0` in our initial run of the query. When our component executes `this.props.loadMoreEntries`, we update the offset based on the current number of messages already loaded, fetch up to 10 more messages, and update our app’s state to push the messages to the end of our data set. We also need to modify the `update` function in our mutations to match our updated `GROUP_QUERY` variables.

We just need to update the `Messages` component to call `this.props.loadMoreEntries` when we call `onEndReached`:

[{]: <helper> (diffStep 5.6)

#### Step 5.6: Apply loadMoreEntries to onEndReached

##### Changed client&#x2F;src&#x2F;screens&#x2F;messages.screen.js
```diff
@@ -83,7 +83,6 @@
 ┊83┊83┊    super(props);
 ┊84┊84┊    this.state = {
 ┊85┊85┊      usernameColors: {},
-┊86┊  ┊      refreshing: false,
 ┊87┊86┊    };
 ┊88┊87┊
 ┊89┊88┊    this.renderItem = this.renderItem.bind(this);
```
```diff
@@ -109,7 +108,7 @@
 ┊109┊108┊  }
 ┊110┊109┊
 ┊111┊110┊  onEndReached() {
-┊112┊   ┊    console.log('TODO: onEndReached');
+┊   ┊111┊    this.props.loadMoreEntries();
 ┊113┊112┊  }
 ┊114┊113┊
 ┊115┊114┊  send(text) {
```
```diff
@@ -180,6 +179,7 @@
 ┊180┊179┊    users: PropTypes.array,
 ┊181┊180┊  }),
 ┊182┊181┊  loading: PropTypes.bool,
+┊   ┊182┊  loadMoreEntries: PropTypes.func,
 ┊183┊183┊};
 ┊184┊184┊
 ┊185┊185┊const ITEMS_PER_PAGE = 10;
```

[}]: #

Boot it up for some pagination! ![Pagination Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step5-6.gif)

We can also modify the Groups component to preview the most recent message for each group. Using the same methodology, we’ll first update `USER_QUERY`:

[{]: <helper> (diffStep 5.7)

#### Step 5.7: Add most recent message to each Group in USER_QUERY

##### Changed client&#x2F;src&#x2F;graphql&#x2F;create-group.mutation.js
```diff
@@ -1,5 +1,7 @@
 ┊1┊1┊import gql from 'graphql-tag';
 ┊2┊2┊
+┊ ┊3┊import MESSAGE_FRAGMENT from './message.fragment';
+┊ ┊4┊
 ┊3┊5┊const CREATE_GROUP_MUTATION = gql`
 ┊4┊6┊  mutation createGroup($name: String!, $userIds: [Int!], $userId: Int!) {
 ┊5┊7┊    createGroup(name: $name, userIds: $userIds, userId: $userId) {
```
```diff
@@ -8,8 +10,12 @@
 ┊ 8┊10┊      users {
 ┊ 9┊11┊        id
 ┊10┊12┊      }
+┊  ┊13┊      messages(limit: 1) { # we don't need to use variables
+┊  ┊14┊        ... MessageFragment
+┊  ┊15┊      }
 ┊11┊16┊    }
 ┊12┊17┊  }
+┊  ┊18┊  ${MESSAGE_FRAGMENT}
 ┊13┊19┊`;
 ┊14┊20┊
 ┊15┊21┊export default CREATE_GROUP_MUTATION;
```

##### Changed client&#x2F;src&#x2F;graphql&#x2F;user.query.js
```diff
@@ -1,5 +1,7 @@
 ┊1┊1┊import gql from 'graphql-tag';
 ┊2┊2┊
+┊ ┊3┊import MESSAGE_FRAGMENT from './message.fragment';
+┊ ┊4┊
 ┊3┊5┊// get the user and all user's groups
 ┊4┊6┊export const USER_QUERY = gql`
 ┊5┊7┊  query user($id: Int) {
```
```diff
@@ -10,6 +12,9 @@
 ┊10┊12┊      groups {
 ┊11┊13┊        id
 ┊12┊14┊        name
+┊  ┊15┊        messages(limit: 1) { # we don't need to use variables
+┊  ┊16┊          ... MessageFragment
+┊  ┊17┊        }
 ┊13┊18┊      }
 ┊14┊19┊      friends {
 ┊15┊20┊        id
```
```diff
@@ -17,6 +22,7 @@
 ┊17┊22┊      }
 ┊18┊23┊    }
 ┊19┊24┊  }
+┊  ┊25┊  ${MESSAGE_FRAGMENT}
 ┊20┊26┊`;
 ┊21┊27┊
 ┊22┊28┊export default USER_QUERY;
```

[}]: #

And then we update the layout of the Group list item component in `Groups`:

[{]: <helper> (diffStep 5.8)

#### Step 5.8: Modify Group component to include latest message

##### Changed client&#x2F;src&#x2F;screens&#x2F;groups.screen.js
```diff
@@ -4,12 +4,15 @@
 ┊ 4┊ 4┊  FlatList,
 ┊ 5┊ 5┊  ActivityIndicator,
 ┊ 6┊ 6┊  Button,
+┊  ┊ 7┊  Image,
 ┊ 7┊ 8┊  StyleSheet,
 ┊ 8┊ 9┊  Text,
 ┊ 9┊10┊  TouchableHighlight,
 ┊10┊11┊  View,
 ┊11┊12┊} from 'react-native';
 ┊12┊13┊import { graphql } from 'react-apollo';
+┊  ┊14┊import moment from 'moment';
+┊  ┊15┊import Icon from 'react-native-vector-icons/FontAwesome';
 ┊13┊16┊
 ┊14┊17┊import { USER_QUERY } from '../graphql/user.query';
 ┊15┊18┊
```
```diff
@@ -36,6 +39,31 @@
 ┊36┊39┊    fontWeight: 'bold',
 ┊37┊40┊    flex: 0.7,
 ┊38┊41┊  },
+┊  ┊42┊  groupTextContainer: {
+┊  ┊43┊    flex: 1,
+┊  ┊44┊    flexDirection: 'column',
+┊  ┊45┊    paddingLeft: 6,
+┊  ┊46┊  },
+┊  ┊47┊  groupText: {
+┊  ┊48┊    color: '#8c8c8c',
+┊  ┊49┊  },
+┊  ┊50┊  groupImage: {
+┊  ┊51┊    width: 54,
+┊  ┊52┊    height: 54,
+┊  ┊53┊    borderRadius: 27,
+┊  ┊54┊  },
+┊  ┊55┊  groupTitleContainer: {
+┊  ┊56┊    flexDirection: 'row',
+┊  ┊57┊  },
+┊  ┊58┊  groupLastUpdated: {
+┊  ┊59┊    flex: 0.3,
+┊  ┊60┊    color: '#8c8c8c',
+┊  ┊61┊    fontSize: 11,
+┊  ┊62┊    textAlign: 'right',
+┊  ┊63┊  },
+┊  ┊64┊  groupUsername: {
+┊  ┊65┊    paddingVertical: 4,
+┊  ┊66┊  },
 ┊39┊67┊  header: {
 ┊40┊68┊    alignItems: 'flex-end',
 ┊41┊69┊    padding: 6,
```
```diff
@@ -48,6 +76,16 @@
 ┊48┊76┊  },
 ┊49┊77┊});
 ┊50┊78┊
+┊  ┊79┊// format createdAt with moment
+┊  ┊80┊const formatCreatedAt = createdAt => moment(createdAt).calendar(null, {
+┊  ┊81┊  sameDay: '[Today]',
+┊  ┊82┊  nextDay: '[Tomorrow]',
+┊  ┊83┊  nextWeek: 'dddd',
+┊  ┊84┊  lastDay: '[Yesterday]',
+┊  ┊85┊  lastWeek: 'dddd',
+┊  ┊86┊  sameElse: 'DD/MM/YYYY',
+┊  ┊87┊});
+┊  ┊88┊
 ┊51┊89┊const Header = ({ onPress }) => (
 ┊52┊90┊  <View style={styles.header}>
 ┊53┊91┊    <Button title={'New Group'} onPress={onPress} />
```
```diff
@@ -65,14 +103,40 @@
 ┊ 65┊103┊  }
 ┊ 66┊104┊
 ┊ 67┊105┊  render() {
-┊ 68┊   ┊    const { id, name } = this.props.group;
+┊   ┊106┊    const { id, name, messages } = this.props.group;
 ┊ 69┊107┊    return (
 ┊ 70┊108┊      <TouchableHighlight
 ┊ 71┊109┊        key={id}
 ┊ 72┊110┊        onPress={this.goToMessages}
 ┊ 73┊111┊      >
 ┊ 74┊112┊        <View style={styles.groupContainer}>
-┊ 75┊   ┊          <Text style={styles.groupName}>{`${name}`}</Text>
+┊   ┊113┊          <Image
+┊   ┊114┊            style={styles.groupImage}
+┊   ┊115┊            source={{
+┊   ┊116┊              uri: 'https://facebook.github.io/react/img/logo_og.png' 
+┊   ┊117┊            }}
+┊   ┊118┊          />
+┊   ┊119┊          <View style={styles.groupTextContainer}>
+┊   ┊120┊            <View style={styles.groupTitleContainer}>
+┊   ┊121┊              <Text style={styles.groupName}>{`${name}`}</Text>
+┊   ┊122┊              <Text style={styles.groupLastUpdated}>
+┊   ┊123┊                {messages.length ?
+┊   ┊124┊                   formatCreatedAt(messages[0].createdAt) : ''}
+┊   ┊125┊              </Text>
+┊   ┊126┊            </View>
+┊   ┊127┊            <Text style={styles.groupUsername}>
+┊   ┊128┊              {messages.length ?
+┊   ┊129┊                  `${messages[0].from.username}:` : ''}
+┊   ┊130┊            </Text>
+┊   ┊131┊            <Text style={styles.groupText} numberOfLines={1}>
+┊   ┊132┊              {messages.length ? messages[0].text : ''}
+┊   ┊133┊            </Text>
+┊   ┊134┊          </View>
+┊   ┊135┊          <Icon
+┊   ┊136┊            name="angle-right"
+┊   ┊137┊            size={24}
+┊   ┊138┊            color={'#8c8c8c'}
+┊   ┊139┊          />
 ┊ 76┊140┊        </View>
 ┊ 77┊141┊      </TouchableHighlight>
 ┊ 78┊142┊    );
```
```diff
@@ -84,6 +148,7 @@
 ┊ 84┊148┊  group: PropTypes.shape({
 ┊ 85┊149┊    id: PropTypes.number,
 ┊ 86┊150┊    name: PropTypes.string,
+┊   ┊151┊    messages: PropTypes.array,
 ┊ 87┊152┊  }),
 ┊ 88┊153┊};
```

[}]: #

![Layout Image](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step5-8.png)

# Refreshing Data
We can apply some of the tricks we’ve just learned to also give users a way to manually refresh data. Currently, if a user sends a message to a group, this new message won’t show up as the latest message on the groups page.

We could solve this problem by modifying `update` within `sendMessage` to update the `user` query. But let’s hold off on implementing that fix and use this opportunity to test manual refreshing.

In addition to `fetchMore`, `graphql` also exposes a [`refetch`](http://dev.apollodata.com/core/apollo-client-api.html#ObservableQuery.refetch) function on the data prop. Executing this function will force the query to refetch data. 

We can modify our `FlatList` to use a built-in [`RefreshControl`](https://facebook.github.io/react-native/docs/refreshcontrol.html) component via [`onRefresh`](https://facebook.github.io/react-native/docs/flatlist.html#onrefresh). When the user pulls down the list, `FlatList` will trigger `onRefresh` where we will `refetch` the `user` query. 
We also need to pass a `refreshing` parameter to `FlatList` to let it know when to show or hide the `RefreshControl`. We can set simply set `refreshing` to check for the `networkStatus` of our query. `networkStatus === 4` means the data is still loading.

[{]: <helper> (diffStep 5.9)

#### Step 5.9: Manual Refresh Groups

##### Changed client&#x2F;src&#x2F;screens&#x2F;groups.screen.js
```diff
@@ -161,6 +161,11 @@
 ┊161┊161┊    super(props);
 ┊162┊162┊    this.goToMessages = this.goToMessages.bind(this);
 ┊163┊163┊    this.goToNewGroup = this.goToNewGroup.bind(this);
+┊   ┊164┊    this.onRefresh = this.onRefresh.bind(this);
+┊   ┊165┊  }
+┊   ┊166┊
+┊   ┊167┊  onRefresh() {
+┊   ┊168┊    this.props.refetch();
 ┊164┊169┊  }
 ┊165┊170┊
 ┊166┊171┊  keyExtractor = item => item.id;
```
```diff
@@ -178,7 +183,7 @@
 ┊178┊183┊  renderItem = ({ item }) => <Group group={item} goToMessages={this.goToMessages} />;
 ┊179┊184┊
 ┊180┊185┊  render() {
-┊181┊   ┊    const { loading, user } = this.props;
+┊   ┊186┊    const { loading, user, networkStatus } = this.props;
 ┊182┊187┊
 ┊183┊188┊    // render loading placeholder while we fetch messages
 ┊184┊189┊    if (loading) {
```
```diff
@@ -206,6 +211,8 @@
 ┊206┊211┊          keyExtractor={this.keyExtractor}
 ┊207┊212┊          renderItem={this.renderItem}
 ┊208┊213┊          ListHeaderComponent={() => <Header onPress={this.goToNewGroup} />}
+┊   ┊214┊          onRefresh={this.onRefresh}
+┊   ┊215┊          refreshing={networkStatus === 4}
 ┊209┊216┊        />
 ┊210┊217┊      </View>
 ┊211┊218┊    );
```
```diff
@@ -216,6 +223,8 @@
 ┊216┊223┊    navigate: PropTypes.func,
 ┊217┊224┊  }),
 ┊218┊225┊  loading: PropTypes.bool,
+┊   ┊226┊  networkStatus: PropTypes.number,
+┊   ┊227┊  refetch: PropTypes.func,
 ┊219┊228┊  user: PropTypes.shape({
 ┊220┊229┊    id: PropTypes.number.isRequired,
 ┊221┊230┊    email: PropTypes.string.isRequired,
```
```diff
@@ -230,8 +239,8 @@
 ┊230┊239┊
 ┊231┊240┊const userQuery = graphql(USER_QUERY, {
 ┊232┊241┊  options: () => ({ variables: { id: 1 } }), // fake the user for now
-┊233┊   ┊  props: ({ data: { loading, user } }) => ({
-┊234┊   ┊    loading, user,
+┊   ┊242┊  props: ({ data: { loading, networkStatus, refetch, user } }) => ({
+┊   ┊243┊    loading, networkStatus, refetch, user,
 ┊235┊244┊  }),
 ┊236┊245┊});
```

[}]: #

Boot it! ![Refetch Gif](https://s3-us-west-1.amazonaws.com/tortilla/chatty/step5-9.gif)
[{]: <helper> (navStep)

| [< Previous Step](step4.md) | [Next Step >](step6.md) |
|:--------------------------------|--------------------------------:|

[}]: #
