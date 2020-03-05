var Utils = function() {
  function parse_jwt(token) {
    var base64Url = token.split('.')[1];
    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  }
  /**
   * Clears all data from environment that is not meant to be explicitly saved.
   */
  function clear_token_data() {
    var env = pm.environment.toObject();
    const to_save = [
      /^baseUrl$/, 
      /^defaultContentType$/,
      /^defaultLanguage$/,
      /^defaultPassword$/,
      /^start-quiz.session$/,
      /^tokens.*$/,
      /^utils$/,
      /^version$/
    ];
    Object.keys(env)
        .filter(key => !to_save.some(re => re.test(key)))
        .map(key => {
           console.log("Clearing key ", key); 
           pm.environment.unset(key);
        });
    
  }
  /**
   * Stores the data passed in the token about the currently authenticated user.
   */
  function add_token_data() {
    let msgs = {};
    let set_var = (myvar, value) => {
        msgs[myvar] = value;
        pm.environment.set(myvar, value);
    };
    // Clear all set vars every time someone logs in.
    clear_token_data();
    var jsonData = JSON.parse(responseBody);
    if (jsonData.token === undefined) {
        throw new Error('Could not retrieve token!');
    }
    var tokenData = parse_jwt(jsonData.token);
    console.info("Parsed JWT Token Values", tokenData);
    set_var('tokens.current', jsonData.token);
    let get_id = (iri) => iri.replace(/.*\//, '');
    let username = tokenData.email;
    set_var('tokens.'+username, jsonData.token);
    Object.keys(tokenData).map((index) => {
        let value = tokenData[index];
        if(Array.isArray(value)) {
            value.map((iri, i) => set_var(username + '.' + index + '.' + i, get_id(iri)));
        }
        else if(typeof value === 'string') {
            set_var(username + '.' + index, get_id(value));
        }
        else {
            set_var(username + '.' + index, value);
        }
    });
    console.debug("Added environment variables", msgs);
    return this;
  }
  /**
   * Asserts that a given enviroment variable is not undefined.
   * 
   * @param string varname
   *   The variable name to assert.
   */
  function assert(varname) {
    const fail_msg = 'Assertion Failure in the request '+ pm.request.url.getRaw() + ': The environment variable ' + varname + ' should exist, but does not.  It may have been cleared by a prior operation, or not yet set with  the appropriate LIST or POST call.';
    try {
        pm.expect(pm.environment.has(varname)).to.be.true;
    } catch (e) {
        pm.expect(fail_msg).to.be.empty;
    }
    return this;
  }
  /**
   * Clears a given variable value.
   * 
   * Makes no presumptions about endpoint.
   * 
   * @param string varname
   *   The variable name to clear.
   */
  function clear_var(varname) {
    let msgs = [];
    const toClean = _.keys(pm.environment.toObject())
    _.each(toClean, (arrItem) => {
        if (arrItem === endpoint) {
            msgs.push(arrItem);
            pm.environment.unset(arrItem)
        }
    });
    if (msgs.length) {
        console.debug("Cleared var", JSON.stringify(msgs));
    }
    return this;
  }
  /**
   * Clears a single named endpoint variable.
   * 
   * Example: Passing the variable '1' with a call to 
   * /users would look for the variable 'users.1'.
   */
  function clear_endpoint_var(varname) {
    const endpoint = pm.request.url.path[0];
    // Clear all prior variables of this type
    let msgs = [];
    const toClean = _.keys(pm.environment.toObject())
    _.each(toClean, (arrItem) => {
        if (arrItem.startsWith(endpoint) && arrItem.endsWith('.' + varname)) {
            msgs.push(arrItem);
            pm.environment.unset(arrItem)
        }
    });
    if (msgs.length) {
        console.debug("Cleared vars", JSON.stringify(msgs));
    }
    return this;
  }
  /**
   * Clears all environment variables for the current endpoint.
   * 
   * Example: A call to /users would look for the variable 
   * 'users.*'.
   */
  function clear_endpoint_vars() {
    const endpoint = pm.request.url.path[0];
    // Clear all prior variables of this type
    let msgs = [];
    const toClean = _.keys(pm.environment.toObject())
    _.each(toClean, (arrItem) => {
        if (arrItem.startsWith(endpoint)) {
            msgs.push(arrItem);
            pm.environment.unset(arrItem)
        }
    });
    if (msgs.length) {
        console.debug("Cleared vars", JSON.stringify(msgs));
    }
    return this;
  }
  /**
   * Sets a single named endpoint variable.
   * 
   * Example: Passing the variable '1' with a call to 
   * /users would set the variable 'users.1' to the
   * value found in the key '@id' of the result.
   */
  function set_endpoint_var(varname) {
    let msgs = {};
    var jsonData = JSON.parse(responseBody);
    // Sets the 'last' variable for this entity type to the result of this
    // request for the owning entity.
    const endpoint = pm.request.url.path[0];
    const id = jsonData['@id'].replace(/.*\/([^\/]+)$/, "$1");
    msgs[endpoint + '.' + varname] = id;
    pm.environment.set(endpoint + '.' + varname, id);
    console.debug("Set var", JSON.stringify(msgs));
    
    return this;
  }
  /**
   * Sets indexed environment variables for the endpoint.
   * 
   * This should be invoked on a LIST request.  It takes
   * the results, and assigns them to environment 
   * variables prefixed by the endpoint.  For example, 
   * if called from the /users LIST endpoint, it would 
   * set the variable 'users.1', 'users.2', etc.  It would
   * also set the '.last' namespaced variable, which will
   * be the last entry in the list.
   */
  function set_endpoint_vars() {
    var jsonData = JSON.parse(responseBody);
    var targets = jsonData['hydra:member'];
    const endpoint = pm.request.url.path[0];
    let msgs = {};
    targets.map((o, i) => {
        let target_id = i+1;
        const id = o['@id'].replace(/.*\/([^\/]+)$/, "$1");
        msgs[endpoint + '.' + target_id] = id;
        pm.environment.set(endpoint + '.' + target_id, id);
        if(i === targets.length - 1) {
            msgs[endpoint + '.last'] = id;
            pm.environment.set(endpoint + '.last', id);
        }
    });
    console.debug("Set vars", JSON.stringify(msgs));
    
    return this;
  }
  /**
   * Sets a random string value to the variable 'random_string'.
   * 
   * Useful for operations where you need to determine a distinction
   * between one write operation and the next.
   */
  function set_random_string() {
    let randomString = (length, chars) => {
        var mask = '';
        if (chars.indexOf('a') > -1) mask += 'abcdefghijklmnopqrstuvwxyz';
        if (chars.indexOf('A') > -1) mask += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (chars.indexOf('#') > -1) mask += '0123456789';
        if (chars.indexOf('!') > -1) mask += '~`!@#$%^&*()_+-={}[]:";\'<>?,./|\\';
        var result = '';
        for (var i = length; i > 0; --i) result += mask[Math.floor(Math.random() * mask.length)];
        return result;
    };
    pm.environment.set('random_string', randomString(15, 'aA'));
  }
  /**
   * Perform actions and operations common to every request.
   */
  function pre_request() {
      // Add the Postman export versio number, so the API can prompt for an upgrade.
      pm.request.headers.add({key: 'version', value: pm.environment.get('version') })
  }
  
  const result = {
    add_token_data: add_token_data,
    assert: assert,
    clear_var: clear_var,
    clear_endpoint_var: clear_endpoint_var,
    clear_endpoint_vars: clear_endpoint_vars,
    parse_jwt: parse_jwt,
    pre_request: pre_request,
    set_endpoint_var: set_endpoint_var,
    set_endpoint_vars: set_endpoint_vars,
    set_random_string: set_random_string
  }
  return result;
};
