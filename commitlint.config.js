// Spec dos commits deste repo, para humanos e para `npx commitlint`.
// Não há job de commitlint no CI ainda — quem lê as mensagens é o semantic-release.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert'],
    ],
    'subject-case': [0],
    'header-max-length': [0],
    'body-max-line-length': [0],
  },
}
