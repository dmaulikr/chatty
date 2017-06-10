import gql from 'graphql-tag';

import GROUP_FRAGMENT from './group.fragment';

const CREATE_GROUP_MUTATION = gql`
  mutation createGroup($group: GroupInput!, $limit: Int = 1, $offset: Int = 0) {
    createGroup(group: $group) {
      ... GroupFragment
    }
  }
  ${GROUP_FRAGMENT}
`;

export default CREATE_GROUP_MUTATION;
