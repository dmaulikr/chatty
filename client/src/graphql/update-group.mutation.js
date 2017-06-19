import gql from 'graphql-tag';

const UPDATE_GROUP_MUTATION = gql`
  mutation updateGroup($group: GroupInput!) {
    updateGroup(group: $group) {
      id
      name
      lastRead {
        id
        createdAt
      }
    }
  }
`;

export default UPDATE_GROUP_MUTATION;
