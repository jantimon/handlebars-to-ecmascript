# Highly experimental

Proof of concept


Turns a template
```
Hello {{world}}!
```

into a ecmascript module
```js
export function render(data1) {
    return 'Hello ' + data1.world + '!';
};
```

# License

This project is licensed under [MIT](https://github.com/jantimon/handlebars-to-ecmascript/blob/master/LICENSE).
