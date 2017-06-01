import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PropTypes from 'prop-types';
import React, { Component } from 'react';
import randomColor from 'randomcolor';
import { graphql, compose } from 'react-apollo';
import ReversedFlatList from 'react-native-reversed-flat-list';
import update from 'immutability-helper';
import { connect } from 'react-redux';

import Message from '../components/message.component';
import MessageInput from '../components/message-input.component';
import GROUP_QUERY from '../graphql/group.query';
import CREATE_MESSAGE_MUTATION from '../graphql/create-message.mutation';
import MESSAGE_ADDED_SUBSCRIPTION from '../graphql/message-added.subscription';

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
    backgroundColor: '#e5ddd5',
    flex: 1,
    flexDirection: 'column',
  },
  loading: {
    justifyContent: 'center',
  },
  titleWrapper: {
    alignItems: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleImage: {
    marginRight: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});

function isDuplicateMessage(newMessage, existingMessages) {
  return newMessage.id !== null &&
    existingMessages.some(message => newMessage.id === message.id);
}

class Messages extends Component {
  static navigationOptions = ({ navigation }) => {
    const { state, navigate } = navigation;

    const goToGroupDetails = navigate.bind(this, 'GroupDetails', {
      id: state.params.groupId,
      title: state.params.title,
    });

    return {
      headerTitle: (
        <TouchableOpacity
          style={styles.titleWrapper}
          onPress={goToGroupDetails}
        >
          <View style={styles.title}>
            <Image
              style={styles.titleImage}
              source={{ uri: 'https://facebook.github.io/react/img/logo_og.png' }}
            />
            <Text>{state.params.title}</Text>
          </View>
        </TouchableOpacity>
      ),
    };
  };

  constructor(props) {
    super(props);
    this.state = {
      usernameColors: {},
    };

    this.renderItem = this.renderItem.bind(this);
    this.send = this.send.bind(this);
    this.onEndReached = this.onEndReached.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    const usernameColors = {};
    // check for new messages
    if (nextProps.group) {
      if (nextProps.group.users) {
        // apply a color to each user
        nextProps.group.users.forEach((user) => {
          usernameColors[user.username] = this.state.usernameColors[user.username] || randomColor();
        });
      }

      // we don't resubscribe on changed props
      // because it never happens in our app
      if (!this.subscription) {
        this.subscription = nextProps.subscribeToMore({
          document: MESSAGE_ADDED_SUBSCRIPTION,
          variables: { groupIds: [nextProps.navigation.state.params.groupId] },
          updateQuery: (previousResult, { subscriptionData }) => {
            const newMessage = subscriptionData.data.messageAdded;
            // if it's our own mutation
            // we might get the subscription result
            // after the mutation result.
            if (isDuplicateMessage(
              newMessage, previousResult.group.messages)
            ) {
              return previousResult;
            }
            return update(previousResult, {
              group: {
                messages: {
                  $unshift: [newMessage],
                },
              },
            });
          },
        });
      }

      this.setState({
        usernameColors,
      });
    }
  }

  onEndReached() {
    this.props.loadMoreEntries();
  }

  send(text) {
    this.props.createMessage({
      groupId: this.props.navigation.state.params.groupId,
      text,
    }).then(() => {
      this.flatList.scrollToBottom({ animated: true });
    });
  }

  keyExtractor = item => item.id;

  renderItem = ({ item: message }) => (
    <Message
      color={this.state.usernameColors[message.from.username]}
      isCurrentUser={message.from.id === this.props.auth.id}
      message={message}
    />
  )

  render() {
    const { loading, group } = this.props;

    // render loading placeholder while we fetch messages
    if (loading && !group) {
      return (
        <View style={[styles.loading, styles.container]}>
          <ActivityIndicator />
        </View>
      );
    }

    // render list of messages for group
    return (
      <KeyboardAvoidingView
        behavior={'position'}
        contentContainerStyle={styles.container}
        keyboardVerticalOffset={64}
        style={styles.container}
      >
        <ReversedFlatList
          ref={(ref) => { this.flatList = ref; }}
          data={group.messages.slice().reverse()}
          keyExtractor={this.keyExtractor}
          renderItem={this.renderItem}
          onEndReached={this.onEndReached}
        />
        <MessageInput send={this.send} />
      </KeyboardAvoidingView>
    );
  }
}

Messages.propTypes = {
  auth: PropTypes.shape({
    id: PropTypes.number,
    username: PropTypes.string,
  }),
  createMessage: PropTypes.func,
  navigation: PropTypes.shape({
    navigate: PropTypes.func,
    state: PropTypes.shape({
      params: PropTypes.shape({
        groupId: PropTypes.number,
      }),
    }),
  }),
  group: PropTypes.shape({
    messages: PropTypes.array,
    users: PropTypes.array,
  }),
  loading: PropTypes.bool,
  loadMoreEntries: PropTypes.func,
  subscribeToMore: PropTypes.func,
};

const ITEMS_PER_PAGE = 10;
const groupQuery = graphql(GROUP_QUERY, {
  options: ownProps => ({
    variables: {
      groupId: ownProps.navigation.state.params.groupId,
      offset: 0,
      limit: ITEMS_PER_PAGE,
    },
  }),
  props: ({ data: { fetchMore, loading, group, subscribeToMore } }) => ({
    loading,
    group,
    subscribeToMore,
    loadMoreEntries() {
      return fetchMore({
        // query: ... (you can specify a different query.
        // GROUP_QUERY is used by default)
        variables: {
          // We are able to figure out offset because it matches
          // the current messages length
          offset: group.messages.length,
        },
        updateQuery: (previousResult, { fetchMoreResult }) => {
          // we will make an extra call to check if no more entries
          if (!fetchMoreResult) { return previousResult; }
          // push results (older messages) to end of messages list
          return update(previousResult, {
            group: {
              messages: { $push: fetchMoreResult.group.messages },
            },
          });
        },
      });
    },
  }),
});

const createMessageMutation = graphql(CREATE_MESSAGE_MUTATION, {
  props: ({ ownProps, mutate }) => ({
    createMessage: ({ text, groupId }) =>
      mutate({
        variables: { text, groupId },
        optimisticResponse: {
          __typename: 'Mutation',
          createMessage: {
            __typename: 'Message',
            id: -1, // don't know id yet, but it doesn't matter
            text, // we know what the text will be
            createdAt: new Date().toISOString(), // the time is now!
            from: {
              __typename: 'User',
              id: ownProps.auth.id,
              username: ownProps.auth.username,
            },
            to: {
              __typename: 'Group',
              id: groupId,
            },
          },
        },
        update: (store, { data: { createMessage } }) => {
          // Read the data from our cache for this query.
          const data = store.readQuery({
            query: GROUP_QUERY,
            variables: {
              groupId,
              offset: 0,
              limit: ITEMS_PER_PAGE,
            },
          });

          if (isDuplicateMessage(createMessage, data.group.messages)) {
            return data;
          }

          // Add our message from the mutation to the end.
          data.group.messages.unshift(createMessage);

          // Write our data back to the cache.
          store.writeQuery({
            query: GROUP_QUERY,
            variables: {
              groupId,
              offset: 0,
              limit: ITEMS_PER_PAGE,
            },
            data,
          });
        },
      }),

  }),
});

const mapStateToProps = ({ auth }) => ({
  auth,
});

export default compose(
  connect(mapStateToProps),
  groupQuery,
  createMessageMutation,
)(Messages);
