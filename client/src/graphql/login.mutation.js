import gql from 'graphql-tag';

const LOGIN_MUTATION = gql`
  mutation login($user: UserInput!) {
    login(user: $user) {
      id
      jwt
      username
    }
  }
`;

export default LOGIN_MUTATION;
