import { map, filter } from 'lodash';
import uuidv4 from 'uuid/v4';
import mime from 'mime-types';

import { Group, Message, User } from './connectors';
import { sendNotification } from '../notifications';
import { uploadFile, deleteFile, getSignedFileUrl } from '../files';

// reusable function to check for a user with context
function getAuthenticatedUser(ctx) {
  return ctx.user.then((user) => {
    if (!user) {
      return Promise.reject('Unauthorized');
    }
    return user;
  });
}

export const messageLogic = {
  from(message, args, ctx) {
    if (!ctx.userLoader) {
      return message.getUser({ attributes: ['id', 'username'] });
    }
    return ctx.userLoader.load(message.userId).then(({ id, username }) => ({ id, username }));
  },
  to(message, args, ctx) {
    if (!ctx.groupLoader) {
      return message.getGroup({ attributes: ['id', 'name'] });
    }
    return ctx.groupLoader.load(message.groupId).then(({ id, name }) => ({ id, name }));
  },
  createMessage(_, messageInput, ctx) {
    const { text, groupId } = messageInput.message;

    return getAuthenticatedUser(ctx)
      .then(user => user.getGroups({ where: { id: groupId } })
      .then((groups) => {
        if (groups.length) {
          return Message.create({
            userId: user.id,
            text,
            groupId,
          }).then((message) => {
            const group = groups[0];
            group.getUsers().then((users) => {
              const userPromises = map(users, usr => usr.increment('badgeCount'));
              Promise.all(userPromises).then((updatedUsers) => {
                const registeredUsers = filter(updatedUsers, usr => usr.registrationId && usr.id !== user.id);
                if (registeredUsers.length) {
                  registeredUsers.forEach(({ badgeCount, registrationId }) => sendNotification({
                    to: registrationId,
                    notification: {
                      title: `${user.username} @ ${group.name}`,
                      body: text,
                      sound: 'default', // can use custom sounds -- see https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/SupportingNotificationsinYourApp.html#//apple_ref/doc/uid/TP40008194-CH4-SW10
                      badge: badgeCount + 1, // badgeCount doesn't get updated in Promise return?!
                      click_action: 'openGroup',
                    },
                    data: {
                      title: `${user.username} @ ${group.name}`,
                      body: text,
                      type: 'MESSAGE_ADDED',
                      group: {
                        id: group.id,
                        name: group.name,
                      },
                    },
                    priority: 'high', // will wake sleeping device
                  }));
                }
              });
            });

            return message;
          });
        }
        return Promise.reject('Unauthorized');
      }));
  },
};

export const groupLogic = {
  users(group) {
    return group.getUsers({ attributes: ['id', 'username'] });
  },
  messages(group, args) {
    return Message.findAll({
      where: { groupId: group.id },
      order: [['createdAt', 'DESC']],
      limit: args.limit,
      offset: args.offset,
    });
  },
  lastRead(group, args, ctx) {
    return getAuthenticatedUser(ctx)
      .then(user => user.getLastRead({ where: { groupId: group.id } }))
      .then((lastRead) => {
        if (lastRead.length) {
          return lastRead[0];
        }

        return null;
      });
  },
  unreadCount(group, args, ctx) {
    return getAuthenticatedUser(ctx)
      .then(user => user.getLastRead({ where: { groupId: group.id } }))
      .then((lastRead) => {
        if (!lastRead.length) {
          return Message.count({ where: { groupId: group.id } });
        }

        return Message.count({
          where: {
            groupId: group.id,
            createdAt: { $gt: lastRead[0].createdAt },
          },
        });
      });
  },
  icon(group) {
    if (group.icon) {
      console.log('getSignedFileUrl for group', group.icon);
      return getSignedFileUrl({ file: group.icon, options: { Expires: 60 * 60 } });
    }

    return null;
  },
  query(_, { id }, ctx) {
    return getAuthenticatedUser(ctx).then(user => Group.findOne({
      where: { id },
      include: [{
        model: User,
        where: { id: user.id },
      }],
    }));
  },
  createGroup(_, groupInput, ctx) {
    const { name, userIds, icon } = groupInput.group;

    return getAuthenticatedUser(ctx)
      .then(user => user.getFriends({ where: { id: { $in: userIds } } })
      .then((friends) => {  // eslint-disable-line arrow-body-style
        return Group.create({
          name,
        }).then((group) => {  // eslint-disable-line arrow-body-style
          return group.addUsers([user, ...friends]).then(() => {
            group.users = [user, ...friends];

            if (icon) {
              return uploadFile({
                file: icon.path,
                options: {
                  name: `${uuidv4()}.${mime.extension(icon.type)}`,
                  acl: 'private',
                },
              })
                .then(data => group.update({ icon: data.Key }));
            }

            return group;
          });
        });
      }));
  },
  deleteGroup(_, { id }, ctx) {
    return getAuthenticatedUser(ctx).then((user) => { // eslint-disable-line arrow-body-style
      return Group.findOne({
        where: { id },
        include: [{
          model: User,
          where: { id: user.id },
        }],
      }).then(group => group.getUsers()
        .then(users => group.removeUsers(users))
        .then(() => Message.destroy({ where: { groupId: group.id } }))
        .then(() => {
          if (group.icon) {
            return deleteFile(group.icon);
          }
          return group;
        })
        .then(() => group.destroy()));
    });
  },
  leaveGroup(_, { id }, ctx) {
    return getAuthenticatedUser(ctx).then((user) => {
      if (!user) {
        return Promise.reject('Unauthorized');
      }

      return Group.findOne({
        where: { id },
        include: [{
          model: User,
          where: { id: user.id },
        }],
      }).then((group) => {
        if (!group) {
          Promise.reject('No group found');
        }

        group.removeUser(user.id);
        return Promise.resolve({ id });
      });
    });
  },
  updateGroup(_, groupInput, ctx) {
    const { id, name, lastRead, icon } = groupInput.group;

    return getAuthenticatedUser(ctx).then((user) => {  // eslint-disable-line arrow-body-style
      return Group.findOne({
        where: { id },
        include: [{
          model: User,
          where: { id: user.id },
        }],
      }).then((group) => {
        if (lastRead) {
          return user.getLastRead({ where: { groupId: id } })
            .then(oldLastRead => user.removeLastRead(oldLastRead))
            .then(user.addLastRead(lastRead))
            .then(() => group);
        }

        if (icon) {
          return uploadFile({
            file: icon.path,
            options: {
              name: `${uuidv4()}.${mime.extension(icon.type)}`,
              acl: 'private', // only group's users should have access
            },
          })
            .then((data) => {
              if (group.icon) {
                return deleteFile(group.icon).then(() => data);
              }

              return data;
            })
            .then(data => group.update({ icon: data.Key }));
        }

        return group.update({ name });
      });
    });
  },
};

export const userLogic = {
  email(user, args, ctx) {
    return getAuthenticatedUser(ctx).then((currentUser) => {
      if (currentUser.id === user.id) {
        return currentUser.email;
      }

      return Promise.reject('Unauthorized');
    });
  },
  friends(user, args, ctx) {
    return getAuthenticatedUser(ctx).then((currentUser) => {
      if (currentUser.id !== user.id) {
        return Promise.reject('Unauthorized');
      }

      return user.getFriends({ attributes: ['id', 'username'] });
    });
  },
  groups(user, args, ctx) {
    return getAuthenticatedUser(ctx).then((currentUser) => {
      if (currentUser.id !== user.id) {
        return Promise.reject('Unauthorized');
      }

      return user.getGroups();
    });
  },
  jwt(user) {
    return Promise.resolve(user.jwt);
  },
  messages(user, args, ctx) {
    return getAuthenticatedUser(ctx).then((currentUser) => {
      if (currentUser.id !== user.id) {
        return Promise.reject('Unauthorized');
      }

      return Message.findAll({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']],
      });
    });
  },
  registrationId(user, args, ctx) {
    return getAuthenticatedUser(ctx).then((currentUser) => {
      if (currentUser.id === user.id) {
        return currentUser.registrationId;
      }

      return Promise.reject('Unauthorized');
    });
  },
  query(_, args, ctx) {
    return getAuthenticatedUser(ctx).then((user) => {
      if (user.id === args.id || user.email === args.email) {
        return user;
      }

      return Promise.reject('Unauthorized');
    });
  },
  updateUser(_, { badgeCount, registrationId, avatar }, ctx) {
    return getAuthenticatedUser(ctx).then((user) => {  // eslint-disable-line arrow-body-style
      const options = {};

      if (registrationId || registrationId === null) {
        options.registrationId = registrationId;
      }

      if (badgeCount || badgeCount === 0) {
        options.badgeCount = badgeCount;
      }

      if (avatar) {
        console.log('New avatar', avatar);
        return uploadFile({
          file: avatar.path,
          options: {
            name: `${uuidv4()}.${mime.extension(avatar.type)}`,
          },
        })
          .then((data) => {
            if (user.avatar) {
              return deleteFile(user.avatar).then(() => data);
            }

            return data;
          })
          .then(data => user.update({ avatar: data.Key }));
      }

      return user.update(options);
    });
  },
};

export const subscriptionLogic = {
  groupAdded(baseParams, args, ctx) {
    return getAuthenticatedUser(ctx)
      .then((user) => {
        if (user.id !== args.userId) {
          return Promise.reject('Unauthorized');
        }

        baseParams.context = ctx;
        return baseParams;
      });
  },
  messageAdded(baseParams, args, ctx) {
    return getAuthenticatedUser(ctx)
      .then(user => user.getGroups({ where: { id: { $in: args.groupIds } }, attributes: ['id'] })
      .then((groups) => {
        // user attempted to subscribe to some groups without access
        if (args.groupIds.length > groups.length) {
          return Promise.reject('Unauthorized');
        }

        baseParams.context = ctx;
        return baseParams;
      }));
  },
};
