module.exports = {
  render: {
    blacklist: /\.(?:lock)$/g,
    transformations: {
      'modified-medium': (Handlebars, view) => {
        return view
          .split(/```diff\n|\n```(?!diff)/).map((chunk, index) => {
            if (index % 2 === 0) { return chunk; }

            const content = Handlebars.escapeExpression(chunk)
              // Make diff changes (e.g. @@ -1,3 +1,3 @@) italic
              .replace(/^@.+$/m, '')
              // Remove removals
              .replace(/\n\-.+/g, '')
              // Bold additions
              .replace(/^(\+.+)$/mg, '<b>$&</b>')
              // Remove numbers
              .replace(/\+?┊?([0-9]| ).*┊/mg, '');
            // Wrap with <pre> tag
            return `<pre>\n${content}\n</pre>`;
          })
          .join('');
      }
    }
  }
}