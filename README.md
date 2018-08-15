# swagger2postman

With the help of this project you can generate a postman-collection-file from a swagger specification file. The postman-collection includes lots of tests which are derived from the modeled interface.

## Getting started

### Prerequisites

You must have a nodejs and npm installed.

You must clone the project to a directory on your maschine.
```
git clone https://github.com/thneeb/swagger2postman.git
```

Then install the depended libraries

```
npm install
```

and compile the project

```
npm run build
```

### Run the tool

```
node lib\test-generator.js --input <your-swagger-file-name> --output <yout-postman-collection-file-name>
```

If the output parameter is not specified the output is printed to standard-out and can be piped to a file.

```
node lib\test-generator.js --input <your-swagger-file-name> > my.postman-collection
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Authors

* **Thomas Neeb** - *Initial work* - [thneeb](https://github.com/thneeb)

Contributors are welcome.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details